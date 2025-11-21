import * as pc from 'playcanvas';

// Import camera controls and reveal script
// Use the same approach as the working example - calculate rootPath
const getRootPath = () => {
    const href = window.location.href;
    const url = new URL(href);
    const pathname = url.pathname;
    // Remove filename to get directory
    const lastSlash = pathname.lastIndexOf('/');
    return pathname.substring(0, lastSlash) || '';
};

const rootPath = getRootPath();

// Use dynamic import with absolute path like the working example does
const { CameraControls } = await import(`${rootPath}/static/scripts/esm/camera-controls.mjs`);
const { GsplatRevealRadial } = await import(`${rootPath}/static/scripts/esm/gsplat/reveal-radial.mjs`);

const canvas = document.getElementById('application-canvas');
window.focus();

// Graphics device options - try webgpu first, fallback to webgl2
const gfxOptions = {
    deviceTypes: ['webgpu', 'webgl2'],
    antialias: false // Gaussian splats don't benefit from antialiasing
};

const device = await pc.createGraphicsDevice(canvas, gfxOptions);

// Create app
const createOptions = new pc.AppOptions();
createOptions.graphicsDevice = device;
createOptions.mouse = new pc.Mouse(document.body);
createOptions.touch = new pc.TouchDevice(document.body);
createOptions.keyboard = new pc.Keyboard(document.body);

createOptions.componentSystems = [
    pc.RenderComponentSystem,
    pc.CameraComponentSystem,
    pc.LightComponentSystem,
    pc.ScriptComponentSystem,
    pc.GSplatComponentSystem
];
createOptions.resourceHandlers = [
    pc.TextureHandler,
    pc.ContainerHandler,
    pc.ScriptHandler,
    pc.GSplatHandler
];

const app = new pc.AppBase(canvas);
app.init(createOptions);

// Set canvas to fill window
app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
app.setCanvasResolution(pc.RESOLUTION_AUTO);

// Load cached dataset positions from localStorage
const loadCachedPositions = () => {
    try {
        const cached = localStorage.getItem('gsplat_dataset_positions');
        if (cached) {
            return JSON.parse(cached);
        }
    } catch (e) {
        console.warn('Failed to load cached positions:', e);
    }
    return null;
};

// Save dataset positions to localStorage
const saveCachedPositions = (positions) => {
    try {
        localStorage.setItem('gsplat_dataset_positions', JSON.stringify(positions));
    } catch (e) {
        console.warn('Failed to save cached positions:', e);
    }
};

// Get default configuration
const getDefaultConfigs = () => ({
    fascade: {
        name: 'BC_Place_Fascade',
        url: 'https://scanaudit.s3.amazonaws.com/GaussianSplattingDatasets/BC_Place/Fascade-lod/lod-meta.json',
        position: [0, 0, 0],
        eulerAngles: [-90, 0, 0],
        scale: [1, 1, 1]
    },
    bowl: {
        name: 'BC_Place_Bowl',
        url: 'https://scanaudit.s3.amazonaws.com/GaussianSplattingDatasets/BC_Place/Bowl-lod/lod-meta.json',
        position: [50, 0, 0], // Place it 50 units to the right of Fascade
        eulerAngles: [-90, 0, 0],
        scale: [1, 1, 1]
    },
    concourse: {
        name: 'Concourse_200',
        url: 'https://scanaudit.s3.amazonaws.com/GaussianSplattingDatasets/BC_Place/Concourse%20200-lod/lod-meta.json',
        position: [-50, 0, 0], // Place it 50 units to the left of Fascade
        eulerAngles: [-90, 0, 0],
        scale: [1, 1, 1]
    }
});

// Load cached positions or use defaults
const cachedPositions = loadCachedPositions();
const defaultConfigs = getDefaultConfigs();
const configs = cachedPositions ? {
    fascade: { ...defaultConfigs.fascade, ...(cachedPositions.fascade || {}) },
    bowl: { ...defaultConfigs.bowl, ...(cachedPositions.bowl || {}) },
    concourse: { ...defaultConfigs.concourse, ...(cachedPositions.concourse || {}) }
} : defaultConfigs;

// Global LOD settings
const config = {
    lodUpdateDistance: 0.5,
    lodUnderfillLimit: 5,
    cameraPosition: [25, 5, -15], // Position camera between the two datasets
    moveSpeed: 4,
    moveFastSpeed: 15,
    enableOrbit: false,
    enablePan: false,
    focusPoint: [25, 3, 0] // Focus point between the two datasets
};

// LOD presets
const LOD_PRESETS = {
    'desktop-max': {
        range: [0, 5],
        lodDistances: [10, 20, 40, 80, 120, 150, 200]
    },
    'desktop': {
        range: [1, 5],
        lodDistances: [5, 10, 25, 50, 65, 90, 150]
    },
    'mobile-max': {
        range: [2, 5],
        lodDistances: [5, 7, 12, 25, 75, 120, 200]
    },
    'mobile': {
        range: [3, 5],
        lodDistances: [2, 4, 6, 10, 75, 120, 200]
    }
};

// Assets - all datasets
const assets = {
    fascade: new pc.Asset('gsplat', 'gsplat', { url: configs.fascade.url }),
    bowl: new pc.Asset('gsplat', 'gsplat', { url: configs.bowl.url }),
    concourse: new pc.Asset('gsplat', 'gsplat', { url: configs.concourse.url }),
    envatlas: new pc.Asset(
        'env-atlas',
        'texture',
        { url: `${rootPath}/static/assets/cubemaps/table-mountain-env-atlas.png` },
        { type: pc.TEXTURETYPE_RGBP, mipmaps: false }
    )
};

// UI Controls
const highResCheckbox = document.getElementById('highRes');
const debugLodCheckbox = document.getElementById('debugLod');
const lodPresetSelect = document.getElementById('lodPreset');
const resolutionSpan = document.getElementById('resolution');
const gsplatCountSpan = document.getElementById('gsplatCount');
const datasetFascadeCheckbox = document.getElementById('datasetFascade');
const datasetBowlCheckbox = document.getElementById('datasetBowl');
const datasetConcourseCheckbox = document.getElementById('datasetConcourse');
const gizmoEnabledCheckbox = document.getElementById('gizmoEnabled');
const gizmoTypeSelect = document.getElementById('gizmoType');
const gizmoTargetSelect = document.getElementById('gizmoTarget');
const gizmoSnapCheckbox = document.getElementById('gizmoSnap');
const maxSplatSizeInput = document.getElementById('maxSplatSize');
const maxSplatSizeValue = document.getElementById('maxSplatSizeValue');
const enableSizeFilterCheckbox = document.getElementById('enableSizeFilter');

// Resolution handling
let highRes = false;
const applyResolution = () => {
    const dpr = window.devicePixelRatio || 1;
    device.maxPixelRatio = highRes ? Math.min(dpr, 2) : (dpr >= 2 ? dpr * 0.5 : dpr);
    app.resizeCanvas();
};

highResCheckbox.addEventListener('change', (e) => {
    highRes = e.target.checked;
    applyResolution();
});

window.addEventListener('resize', applyResolution);
app.on('destroy', () => {
    window.removeEventListener('resize', applyResolution);
});

// Load assets
const assetListLoader = new pc.AssetListLoader(Object.values(assets), app.assets);
assetListLoader.load(() => {
    app.start();

    // Setup skydome
    app.scene.skyboxMip = 1;
    app.scene.exposure = 1.5;

    // Configure GSplat LOD settings
    app.scene.gsplat.lodUpdateAngle = 90;
    app.scene.gsplat.lodBehindPenalty = 5;
    app.scene.gsplat.radialSorting = true;
    app.scene.gsplat.lodUpdateDistance = config.lodUpdateDistance;
    app.scene.gsplat.lodUnderfillLimit = config.lodUnderfillLimit;

    // Initialize LOD settings
    let debugLod = false;
    let lodPreset = pc.platform.mobile ? 'mobile' : 'desktop';
    app.scene.gsplat.colorizeLod = debugLod;

    // Create first GSplat entity - BC Place Fascade
    const fascadeEntity = new pc.Entity(configs.fascade.name);
    fascadeEntity.addComponent('gsplat', {
        asset: assets.fascade,
        unified: true
    });
    fascadeEntity.setLocalPosition(...configs.fascade.position);
    const [rotX1, rotY1, rotZ1] = configs.fascade.eulerAngles;
    fascadeEntity.setLocalEulerAngles(rotX1, rotY1, rotZ1);
    fascadeEntity.setLocalScale(...configs.fascade.scale);
    app.root.addChild(fascadeEntity);
    const gs1 = fascadeEntity.gsplat;

    // Create second GSplat entity - BC Place Bowl
    const bowlEntity = new pc.Entity(configs.bowl.name);
    bowlEntity.addComponent('gsplat', {
        asset: assets.bowl,
        unified: true
    });
    bowlEntity.setLocalPosition(...configs.bowl.position);
    const [rotX2, rotY2, rotZ2] = configs.bowl.eulerAngles;
    bowlEntity.setLocalEulerAngles(rotX2, rotY2, rotZ2);
    bowlEntity.setLocalScale(...configs.bowl.scale);
    app.root.addChild(bowlEntity);
    const gs2 = bowlEntity.gsplat;

    // Create third GSplat entity - Concourse 200
    const concourseEntity = new pc.Entity(configs.concourse.name);
    concourseEntity.addComponent('gsplat', {
        asset: assets.concourse,
        unified: true
    });
    concourseEntity.setLocalPosition(...configs.concourse.position);
    const [rotX3, rotY3, rotZ3] = configs.concourse.eulerAngles;
    concourseEntity.setLocalEulerAngles(rotX3, rotY3, rotZ3);
    concourseEntity.setLocalScale(...configs.concourse.scale);
    app.root.addChild(concourseEntity);
    const gs3 = concourseEntity.gsplat;

    // Custom shader code to filter splats by size
    const getSizeFilterShader = (maxSize, enabled) => {
        const device = app.graphicsDevice;
        const shaderLanguage = device.isWebGPU ? 'wgsl' : 'glsl';
        
        if (!enabled) {
            // Return empty shader to disable filtering (all three functions required)
            return shaderLanguage === 'wgsl' ? /* wgsl */`
fn modifyCenter(center: ptr<function, vec3f>) {
    // No modification
}

fn modifyCovariance(originalCenter: vec3f, modifiedCenter: vec3f, covA: ptr<function, vec3f>, covB: ptr<function, vec3f>) {
    // No filtering
}

fn modifyColor(center: vec3f, color: ptr<function, vec4f>) {
    // No modification
}
` : /* glsl */`
void modifyCenter(inout vec3 center) {
    // No modification
}

void modifyCovariance(vec3 originalCenter, vec3 modifiedCenter, inout vec3 covA, inout vec3 covB) {
    // No filtering
}

void modifyColor(vec3 center, inout vec4 color) {
    // No modification
}
`;
        }
        
        if (shaderLanguage === 'wgsl') {
            return /* wgsl */`
uniform maxSplatSize: f32;

fn modifyCenter(center: ptr<function, vec3f>) {
    // No modification to center
}

fn modifyCovariance(originalCenter: vec3f, modifiedCenter: vec3f, covA: ptr<function, vec3f>, covB: ptr<function, vec3f>) {
    // Extract the RMS size from covariance
    let size = gsplatExtractSize(*covA, *covB);
    
    // Hide splats larger than the threshold
    if (size > uniform.maxSplatSize) {
        gsplatMakeRound(covA, covB, 0.0);
    }
}

fn modifyColor(center: vec3f, color: ptr<function, vec4f>) {
    // No modification to color
}
`;
        } else {
            return /* glsl */`
uniform float maxSplatSize;

void modifyCenter(inout vec3 center) {
    // No modification to center
}

void modifyCovariance(vec3 originalCenter, vec3 modifiedCenter, inout vec3 covA, inout vec3 covB) {
    // Extract the RMS size from covariance
    float size = gsplatExtractSize(covA, covB);
    
    // Hide splats larger than the threshold
    if (size > maxSplatSize) {
        gsplatMakeRound(covA, covB, 0.0);
    }
}

void modifyColor(vec3 center, inout vec4 color) {
    // No modification to color
}
`;
        }
    };

    // Function to apply size filter to unified materials
    const applySizeFilter = (maxSize, enabled) => {
        const device = app.graphicsDevice;
        const shaderLanguage = device.isWebGPU ? 'wgsl' : 'glsl';
        const gsplatSystem = app.systems.gsplat;
        const scene = app.scene;
        const composition = scene.layers;
        
        // Get custom shader chunk
        const customShader = getSizeFilterShader(maxSize, enabled);
        
        // Apply to all camera/layer combinations (unified mode)
        const targetCameras = composition.cameras.map(cameraComponent => cameraComponent.camera);
        
        targetCameras.forEach((camera) => {
            // Get all layers from layerList
            const layerList = composition.layerList;
            if (layerList) {
                layerList.forEach((layer) => {
                    // Check if this camera renders this layer
                    if (layer.enabled && camera.layers.indexOf(layer.id) >= 0) {
                        const material = gsplatSystem.getGSplatMaterial(camera, layer);
                        if (material) {
                            // Set custom shader chunk
                            material.getShaderChunks(shaderLanguage).set('gsplatCustomizeVS', customShader);
                            
                            // Set uniform for max size threshold
                            if (enabled) {
                                material.setParameter('maxSplatSize', maxSize);
                            }
                            
                            material.update();
                        }
                    }
                });
            }
        });
    };

    // Size filter state
    let sizeFilterEnabled = false;
    let currentMaxSize = 1.5;

    // Update size filter display
    maxSplatSizeValue.textContent = currentMaxSize.toFixed(2);
    maxSplatSizeInput.value = currentMaxSize;

    // Size filter input handler
    maxSplatSizeInput.addEventListener('input', (e) => {
        currentMaxSize = parseFloat(e.target.value);
        maxSplatSizeValue.textContent = currentMaxSize.toFixed(2);
        
        if (sizeFilterEnabled) {
            // Apply filter to all unified materials
            applySizeFilter(currentMaxSize, true);
        }
    });

    // Enable/disable size filter
    enableSizeFilterCheckbox.addEventListener('change', (e) => {
        sizeFilterEnabled = e.target.checked;
        
        // Apply filter to all unified materials
        applySizeFilter(currentMaxSize, sizeFilterEnabled);
        
        // Enable/disable size input
        maxSplatSizeInput.disabled = !sizeFilterEnabled;
    });

    // Listen for material creation events to apply filter when materials are ready
    app.systems.gsplat.on('material:created', (material, camera, layer) => {
        if (sizeFilterEnabled) {
            const device = app.graphicsDevice;
            const shaderLanguage = device.isWebGPU ? 'wgsl' : 'glsl';
            const customShader = getSizeFilterShader(currentMaxSize, true);
            
            material.getShaderChunks(shaderLanguage).set('gsplatCustomizeVS', customShader);
            material.setParameter('maxSplatSize', currentMaxSize);
            material.update();
        }
    });

    // Apply LOD preset to both entities
    const applyPreset = () => {
        const preset = lodPresetSelect.value;
        lodPreset = preset;
        const presetData = LOD_PRESETS[preset] || LOD_PRESETS.desktop;
        app.scene.gsplat.lodRangeMin = presetData.range[0];
        app.scene.gsplat.lodRangeMax = presetData.range[1];
        // Apply same LOD distances to both entities
        gs1.lodDistances = presetData.lodDistances;
        gs2.lodDistances = presetData.lodDistances;
    };

    applyPreset();
    lodPresetSelect.addEventListener('change', applyPreset);

    // Debug LOD coloring
    debugLodCheckbox.addEventListener('change', (e) => {
        debugLod = e.target.checked;
        app.scene.gsplat.colorizeLod = debugLod;
    });

    // Create camera
    const camera = new pc.Entity('camera');
    camera.addComponent('camera', {
        clearColor: new pc.Color(0.2, 0.2, 0.2),
        fov: 75,
        toneMapping: pc.TONEMAP_ACES
    });

    const [camX, camY, camZ] = config.cameraPosition;
    const [focusX, focusY, focusZ] = config.focusPoint || [0, 0.6, 0];
    const focusPoint = new pc.Vec3(focusX, focusY, focusZ);

    camera.setLocalPosition(camX, camY, camZ);
    app.root.addChild(camera);

    // Add reveal script to Fascade entity
    fascadeEntity.addComponent('script');
    const revealScript1 = fascadeEntity.script?.create(GsplatRevealRadial);
    if (revealScript1) {
        revealScript1.center.set(focusX, focusY, focusZ);
        revealScript1.speed = 5;
        revealScript1.acceleration = 0;
        revealScript1.delay = 3;
        revealScript1.oscillationIntensity = 0.2;
        revealScript1.endRadius = 25;
    }

    // Add reveal script to Bowl entity
    bowlEntity.addComponent('script');
    const revealScript2 = bowlEntity.script?.create(GsplatRevealRadial);
    if (revealScript2) {
        revealScript2.center.set(focusX, focusY, focusZ);
        revealScript2.speed = 5;
        revealScript2.acceleration = 0;
        revealScript2.delay = 3;
        revealScript2.oscillationIntensity = 0.2;
        revealScript2.endRadius = 25;
    }

    // Add camera controls
    camera.addComponent('script');
    const cc = camera.script?.create(CameraControls);
    Object.assign(cc, {
        sceneSize: 500,
        moveSpeed: config.moveSpeed,
        moveFastSpeed: config.moveFastSpeed,
        enableOrbit: config.enableOrbit ?? false,
        enablePan: config.enablePan ?? false,
        focusPoint: focusPoint
    });

    // Create gizmo layer and gizmos
    const gizmoLayer = pc.Gizmo.createLayer(app);
    const gizmos = {
        translate: new pc.TranslateGizmo(camera.camera, gizmoLayer),
        rotate: new pc.RotateGizmo(camera.camera, gizmoLayer),
        scale: new pc.ScaleGizmo(camera.camera, gizmoLayer)
    };

    // Store entity references
    const entities = {
        fascade: fascadeEntity,
        bowl: bowlEntity,
        concourse: concourseEntity
    };

    // Dataset visibility handlers
    // In unified mode, we need to disable/enable the component itself
    datasetFascadeCheckbox.addEventListener('change', (e) => {
        fascadeEntity.gsplat.enabled = e.target.checked;
    });
    datasetBowlCheckbox.addEventListener('change', (e) => {
        bowlEntity.gsplat.enabled = e.target.checked;
    });
    datasetConcourseCheckbox.addEventListener('change', (e) => {
        concourseEntity.gsplat.enabled = e.target.checked;
    });

    // Current gizmo state
    let currentGizmoType = 'translate';
    let currentTarget = 'fascade';
    let gizmosEnabled = true;

    // Function to update gizmo
    const updateGizmo = () => {
        // Detach all gizmos
        for (const type in gizmos) {
            gizmos[type].detach();
        }

        // Only attach if gizmos are enabled
        if (gizmosEnabled) {
            // Attach current gizmo to current target
            const targetEntity = entities[currentTarget];
            if (targetEntity) {
                gizmos[currentGizmoType].attach([targetEntity]);
                
                // Update snap state
                gizmos[currentGizmoType].snap = gizmoSnapCheckbox.checked;
            }
        }
    };

    // Disable camera controls when gizmo is being used
    app.on('gizmo:pointer', (hasPointer) => {
        if (cc) {
            cc.enabled = !hasPointer;
        }
    });

    // Function to save entity positions to cache
    const saveEntityPositions = () => {
        const pos1 = fascadeEntity.getLocalPosition();
        const rot1 = fascadeEntity.getLocalEulerAngles();
        const scale1 = fascadeEntity.getLocalScale();
        const pos2 = bowlEntity.getLocalPosition();
        const rot2 = bowlEntity.getLocalEulerAngles();
        const scale2 = bowlEntity.getLocalScale();
        const pos3 = concourseEntity.getLocalPosition();
        const rot3 = concourseEntity.getLocalEulerAngles();
        const scale3 = concourseEntity.getLocalScale();
        
        const positions = {
            fascade: {
                position: [pos1.x, pos1.y, pos1.z],
                eulerAngles: [rot1.x, rot1.y, rot1.z],
                scale: [scale1.x, scale1.y, scale1.z]
            },
            bowl: {
                position: [pos2.x, pos2.y, pos2.z],
                eulerAngles: [rot2.x, rot2.y, rot2.z],
                scale: [scale2.x, scale2.y, scale2.z]
            },
            concourse: {
                position: [pos3.x, pos3.y, pos3.z],
                eulerAngles: [rot3.x, rot3.y, rot3.z],
                scale: [scale3.x, scale3.y, scale3.z]
            }
        };
        saveCachedPositions(positions);
    };

    // Setup gizmo pointer events and save positions on transform end
    for (const type in gizmos) {
        gizmos[type].on('pointer:down', (_x, _y, meshInstance) => {
            app.fire('gizmo:pointer', !!meshInstance);
        });
        gizmos[type].on('pointer:up', () => {
            app.fire('gizmo:pointer', false);
        });
        // Save positions when transformation ends
        gizmos[type].on('transform:end', () => {
            saveEntityPositions();
        });
    }

    // Gizmo enabled change handler
    gizmoEnabledCheckbox.addEventListener('change', (e) => {
        gizmosEnabled = e.target.checked;
        updateGizmo();
        
        // Enable/disable other gizmo controls
        gizmoTypeSelect.disabled = !gizmosEnabled;
        gizmoTargetSelect.disabled = !gizmosEnabled;
        gizmoSnapCheckbox.disabled = !gizmosEnabled;
    });

    // Gizmo type change handler
    gizmoTypeSelect.addEventListener('change', (e) => {
        currentGizmoType = e.target.value;
        updateGizmo();
    });

    // Gizmo target change handler
    gizmoTargetSelect.addEventListener('change', (e) => {
        currentTarget = e.target.value;
        updateGizmo();
    });

    // Gizmo snap change handler
    gizmoSnapCheckbox.addEventListener('change', (e) => {
        if (gizmosEnabled && gizmos[currentGizmoType]) {
            gizmos[currentGizmoType].snap = e.target.checked;
        }
    });


    // Initialize gizmo
    updateGizmo();

    // Update gizmo size on resize
    const updateGizmoSize = () => {
        const bounds = canvas.getBoundingClientRect();
        const dim = camera.camera.horizontalFov ? bounds.width : bounds.height;
        const gizmoSize = 1024 / dim;
        for (const type in gizmos) {
            gizmos[type].size = gizmoSize;
        }
    };

    window.addEventListener('resize', updateGizmoSize);
    updateGizmoSize();

    // Update stats
    app.on('update', () => {
        gsplatCountSpan.textContent = app.stats.frame.gsplats.toLocaleString();
        const bb = app.graphicsDevice.backBufferSize;
        resolutionSpan.textContent = `${bb.x} x ${bb.y}`;
    });

    // Initial resolution setup
    applyResolution();
});

// Mark as ready for iframe parent
Object.defineProperty(window, 'ready', {
    get: () => app?.started ?? false
});

export { app };

