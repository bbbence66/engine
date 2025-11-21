import { Container } from '@playcanvas/pcui/react';
import { Component } from 'react';
import { HashRouter, Switch, Route, Redirect } from 'react-router-dom';

import { CodeEditorDesktop } from './code-editor/CodeEditorDesktop.mjs';
import { Example } from './Example.mjs';
import { Menu } from './Menu.mjs';
import { SideBar } from './Sidebar.mjs';
import { iframe } from '../iframe.mjs';
import { jsx } from '../jsx.mjs';
import { getOrientation } from '../utils.mjs';

// eslint-disable-next-line jsdoc/require-property
/**
 * @typedef {object} Props
 */

/**
 * @typedef {object} State
 * @property {'portrait'|'landscape'} orientation - Current orientation.
 */

/** @type {typeof Component<Props, State>} */
const TypedComponent = Component;

class MainLayout extends TypedComponent {
    /** @type {State} */
    state = {
        orientation: getOrientation()
    };

    /**
     * @param {Props} props - Component properties.
     */
    constructor(props) {
        super(props);
        this._onLayoutChange = this._onLayoutChange.bind(this);
    }

    _onLayoutChange() {
        this.setState({ ...this.state, orientation: getOrientation() });
    }

    componentDidMount() {
        window.addEventListener('resize', this._onLayoutChange);
        window.addEventListener('orientationchange', this._onLayoutChange);
    }

    componentWillUnmount() {
        window.removeEventListener('resize', this._onLayoutChange);
        window.removeEventListener('orientationchange', this._onLayoutChange);
    }

    /**
     * @param {boolean} value - Show MiniStats state.
     */
    updateShowMiniStats = (value) => {
        iframe.fire('stats', { state: value });
    };

    render() {
        const { orientation } = this.state;
        return jsx(
            'div',
            { id: 'appInner' },
            jsx(
                HashRouter,
                null,
                jsx(
                    Switch,
                    null,
                    jsx(Route, { exact: true, path: '/' }, jsx(Redirect, { to: '/misc/hello-world' })),
                    jsx(
                        Route,
                        { exact: true, path: '/viewer' },
                        jsx(
                            'div',
                            {
                                style: {
                                    width: '100%',
                                    height: '100vh',
                                    margin: 0,
                                    padding: 0,
                                    overflow: 'hidden',
                                    position: 'fixed',
                                    top: 0,
                                    left: 0,
                                    zIndex: 1000
                                }
                            },
                            jsx('iframe', {
                                src: '/viewer.html',
                                style: {
                                    width: '100%',
                                    height: '100%',
                                    border: 'none',
                                    display: 'block'
                                },
                                allow: 'fullscreen'
                            })
                        )
                    ),
                    jsx(
                        Route,
                        { path: '/:category/:example' },
                        jsx(SideBar, null),
                        jsx(
                            Container,
                            { id: 'main-view-wrapper' },
                            jsx(Menu, {
                                setShowMiniStats: this.updateShowMiniStats.bind(this)
                            }),
                            jsx(
                                Container,
                                { id: 'main-view' },
                                orientation === 'landscape' && jsx(CodeEditorDesktop),
                                jsx(Example, null)
                            )
                        )
                    )
                )
            )
        );
    }
}

export { MainLayout };
