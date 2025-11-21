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

// Configuration
const config = {
    name: 'Roman-Parish',
    url: 'https://code.playcanvas.com/examples_data/example_roman_parish_02/lod-meta.json',
    lodUpdateDistance: 0.5,
    lodUnderfillLimit: 5,
    cameraPosition: [10.3, 2, -10],
    eulerAngles: [-90, 0, 0],
    moveSpeed: 4,
    moveFastSpeed: 15,
    enableOrbit: false,
    enablePan: false,
    focusPoint: [12, 3, 0]
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

// Assets
const assets = {
    church: new pc.Asset('gsplat', 'gsplat', { url: config.url }),
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

    // Create GSplat entity
    const entity = new pc.Entity(config.name || 'gsplat');
    entity.addComponent('gsplat', {
        asset: assets.church,
        unified: true
    });
    entity.setLocalPosition(0, 0, 0);
    const [rotX, rotY, rotZ] = config.eulerAngles || [-90, 0, 0];
    entity.setLocalEulerAngles(rotX, rotY, rotZ);
    entity.setLocalScale(1, 1, 1);
    app.root.addChild(entity);
    const gs = entity.gsplat;

    // Apply LOD preset
    const applyPreset = () => {
        const preset = lodPresetSelect.value;
        lodPreset = preset;
        const presetData = LOD_PRESETS[preset] || LOD_PRESETS.desktop;
        app.scene.gsplat.lodRangeMin = presetData.range[0];
        app.scene.gsplat.lodRangeMax = presetData.range[1];
        gs.lodDistances = presetData.lodDistances;
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

    // Add reveal script
    entity.addComponent('script');
    const revealScript = entity.script?.create(GsplatRevealRadial);
    if (revealScript) {
        revealScript.center.set(focusX, focusY, focusZ);
        revealScript.speed = 5;
        revealScript.acceleration = 0;
        revealScript.delay = 3;
        revealScript.oscillationIntensity = 0.2;
        revealScript.endRadius = 25;
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

