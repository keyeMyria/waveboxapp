import PropTypes from 'prop-types'
import './BrowserScene.less'
import React from 'react'
import shallowCompare from 'react-addons-shallow-compare'
import BrowserView from 'sharedui/Components/BrowserView'
import BrowserTargetUrl from './BrowserTargetUrl'
import BrowserSearch from './BrowserSearch'
import BrowserToolbar from './BrowserToolbar'
import { browserActions, browserStore } from 'stores/browser'
import { settingsStore } from 'stores/settings'
import MouseNavigationDarwin from 'sharedui/Navigators/MouseNavigationDarwin'
import {
  WB_WINDOW_RELOAD_WEBVIEW,
  WB_WINDOW_OPEN_DEV_TOOLS_WEBVIEW,
  WB_WINDOW_NAVIGATE_WEBVIEW_BACK,
  WB_WINDOW_NAVIGATE_WEBVIEW_FORWARD,
  WB_BROWSER_GUEST_WINDOW_CLOSE,
  WB_PONG_RESOURCE_USAGE,
  WB_NEW_WINDOW,
  WB_BROWSER_START_SPELLCHECK
} from 'shared/ipcEvents'
import { ipcRenderer, remote } from 'electron'

const { shell } = remote

const SEARCH_REF = 'search'
const BROWSER_REF = 'browser'

export default class BrowserScene extends React.Component {
  /* **************************************************************************/
  // Class
  /* **************************************************************************/

  static propTypes = {
    url: PropTypes.string.isRequired,
    partition: PropTypes.string.isRequired
  }

  /* **************************************************************************/
  // Lifecycle
  /* **************************************************************************/

  componentDidMount () {
    browserStore.listen(this.browserUpdated)
    settingsStore.listen(this.settingsUpdated)
    ipcRenderer.on(WB_WINDOW_RELOAD_WEBVIEW, this.handleIPCReload)
    ipcRenderer.on(WB_WINDOW_OPEN_DEV_TOOLS_WEBVIEW, this.handleIPCOpenDevTools)
    ipcRenderer.on(WB_WINDOW_NAVIGATE_WEBVIEW_BACK, this.handleIPCNavigateBack)
    ipcRenderer.on(WB_WINDOW_NAVIGATE_WEBVIEW_FORWARD, this.handleIPCNavigateForward)
    if (process.platform === 'darwin') {
      this.mouseNavigator = new MouseNavigationDarwin(this.handleIPCNavigateBack, this.handleIPCNavigateForward)
      this.mouseNavigator.register()
    }
  }

  componentWillUnmount () {
    browserStore.unlisten(this.browserUpdated)
    settingsStore.unlisten(this.settingsUpdated)
    ipcRenderer.removeListener(WB_WINDOW_RELOAD_WEBVIEW, this.handleIPCReload)
    ipcRenderer.removeListener(WB_WINDOW_OPEN_DEV_TOOLS_WEBVIEW, this.handleIPCOpenDevTools)
    ipcRenderer.removeListener(WB_WINDOW_NAVIGATE_WEBVIEW_BACK, this.handleIPCNavigateBack)
    ipcRenderer.removeListener(WB_WINDOW_NAVIGATE_WEBVIEW_FORWARD, this.handleIPCNavigateForward)
    if (process.platform === 'darwin') {
      this.mouseNavigator.unregister()
    }
  }

  /* **************************************************************************/
  // Data lifecycle
  /* **************************************************************************/

  state = (() => {
    const browserState = browserStore.getState()
    const settingsState = settingsStore.getState()
    return {
      isSearching: browserState.isSearching,
      searchTerm: browserState.searchTerm,
      searchNextHash: browserState.searchNextHash,
      zoomFactor: browserState.zoomFactor,
      language: settingsState.language
    }
  })()

  browserUpdated = (browserState) => {
    this.setState({
      isSearching: browserState.isSearching,
      searchTerm: browserState.searchTerm,
      searchNextHash: browserState.searchNextHash,
      zoomFactor: browserState.zoomFactor
    })
  }

  settingsUpdated = (settingsState) => {
    this.setState((prevState) => {
      const update = {
        language: settingsState.language
      }

      if (settingsState.language !== prevState.language) {
        const prevLanguage = prevState.language
        const nextLanguage = update.language
        if (prevLanguage.spellcheckerLanguage !== nextLanguage.spellcheckerLanguage || prevLanguage.secondarySpellcheckerLanguage !== nextLanguage.secondarySpellcheckerLanguage) {
          this.refs[BROWSER_REF].send(WB_BROWSER_START_SPELLCHECK, {
            language: nextLanguage.spellcheckerLanguage,
            secondaryLanguage: nextLanguage.secondarySpellcheckerLanguage
          })
        }
      }

      return update
    })
  }

  /* **************************************************************************/
  // IPC Events
  /* **************************************************************************/

  handleIPCReload = () => {
    this.refs[BROWSER_REF].reload()
  }

  handleIPCNavigateBack = () => {
    this.refs[BROWSER_REF].goBack()
  }

  handleIPCNavigateForward = () => {
    this.refs[BROWSER_REF].goForward()
  }

  handleIPCOpenDevTools = () => {
    this.refs[BROWSER_REF].openDevTools()
  }

  /* **************************************************************************/
  // UI Events
  /* **************************************************************************/

  /**
  * Handles the navigation state changing
  * @param evt: an event which includes a url prop
  */
  navigationStateDidChange = (evt) => {
    if (evt.url) {
      browserActions.setCurrentUrl(evt.url)
    }
    browserActions.updateNavigationControls(
      this.refs[BROWSER_REF].canGoBack(),
      this.refs[BROWSER_REF].canGoForward()
    )
  }

  /**
  * Handles IPC Messages from the browser
  * @param evt: the event that fired
  */
  handleBrowserIPCMessage = (evt) => {
    switch (evt.channel.type) {
      case WB_PONG_RESOURCE_USAGE:
        ipcRenderer.send(WB_PONG_RESOURCE_USAGE, evt.channel.data)
        break
      case WB_BROWSER_GUEST_WINDOW_CLOSE:
        this.handleIPCGuestWindowClose(evt.channel.data)
        break
      case WB_NEW_WINDOW:
        ipcRenderer.send(WB_NEW_WINDOW, evt.channel.data)
        break
    }
  }

  /**
  * Handles closing the guest requesting the ipc window closure
  * @param evt: the event that fired
  */
  handleIPCGuestWindowClose = (evt) => {
    remote.getCurrentWindow().close()
  }

  /**
  * Handles the Browser DOM becoming ready
  */
  handleBrowserDomReady = () => {
    const { language } = this.state

    // Language
    if (language.spellcheckerEnabled) {
      this.refs[BROWSER_REF].send(WB_BROWSER_START_SPELLCHECK, {
        language: language.spellcheckerLanguage,
        secondaryLanguage: language.secondarySpellcheckerLanguage
      })
    }
  }

  /* **************************************************************************/
  // Rendering
  /* **************************************************************************/

  shouldComponentUpdate (nextProps, nextState) {
    return shallowCompare(this, nextProps, nextState)
  }

  render () {
    const { url, partition } = this.props
    const { zoomFactor, isSearching, searchTerm, searchNextHash } = this.state

    // The partition should be set on the will-attach-webview in the main thread
    // but this doesn't have the desired effect. Set it here for good-stead
    return (
      <div className='ReactComponent-BrowserScene'>
        <BrowserToolbar
          handleGoBack={() => this.refs[BROWSER_REF].goBack()}
          handleGoForward={() => this.refs[BROWSER_REF].goForward()}
          handleStop={() => this.refs[BROWSER_REF].stop()}
          handleReload={() => this.refs[BROWSER_REF].reload()} />
        <div className='ReactComponent-BrowserSceneWebViewContainer'>
          <BrowserView
            ref={BROWSER_REF}
            src={url}
            partition={partition}
            plugins
            className='ReactComponent-BrowserSceneWebView'
            webpreferences='contextIsolation=yes, nativeWindowOpen=yes'
            preload={window.guestResolve('preload/contentWindow')}
            zoomFactor={zoomFactor}
            searchTerm={isSearching ? searchTerm : undefined}
            searchId={searchNextHash}
            updateTargetUrl={(evt) => browserActions.setTargetUrl(evt.url)}
            pageTitleUpdated={(evt) => browserActions.setPageTitle(evt.title)}
            didStartLoading={(evt) => browserActions.startLoading()}
            didStopLoading={(evt) => browserActions.stopLoading()}
            newWindow={(evt) => shell.openExternal(evt.url, { })}
            ipcMessage={this.handleBrowserIPCMessage}
            domReady={this.handleBrowserDomReady}
            willNavigate={this.navigationStateDidChange}
            didNavigate={this.navigationStateDidChange}
            didNavigateInPage={(evt) => {
              if (evt.isMainFrame) { this.navigationStateDidChange(evt) }
            }} />
        </div>
        <BrowserTargetUrl />
        <BrowserSearch ref={SEARCH_REF} />
      </div>
    )
  }
}
