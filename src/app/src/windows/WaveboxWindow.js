import {BrowserWindow} from 'electron'
import EventEmitter from 'events'
import settingStore from 'stores/settingStore'
import WaveboxWindowLocationSaver from './WaveboxWindowLocationSaver'
import {
  WB_WINDOW_FIND_START,
  WB_WINDOW_FIND_NEXT,
  WB_WINDOW_ZOOM_IN,
  WB_WINDOW_ZOOM_OUT,
  WB_WINDOW_ZOOM_RESET,
  WB_PING_RESOURCE_USAGE,
  WB_WINDOW_DARWIN_SCROLL_TOUCH_BEGIN,
  WB_WINDOW_DARWIN_SCROLL_TOUCH_END
} from 'shared/ipcEvents'
import Resolver from 'Runtime/Resolver'

class WaveboxWindow extends EventEmitter {
  /* ****************************************************************************/
  // Lifecycle
  /* ****************************************************************************/

  /**
  * @param windowId = undefined: the id of the window
  */
  constructor (windowId = undefined) {
    super()
    this.windowId = windowId
    this.ownerId = null
    this.window = null
    this.locationSaver = new WaveboxWindowLocationSaver(windowId)
  }

  /**
  * The default window preferences
  * @return the settings
  */
  defaultBrowserWindowPreferences () {
    let icon
    if (process.platform === 'win32') {
      icon = Resolver.icon('app.ico')
    } else if (process.platform === 'linux') {
      icon = Resolver.icon('app.png')
    }

    return {
      title: 'Wavebox',
      icon: icon
    }
  }

  /* ****************************************************************************/
  // Window lifecycle
  /* ****************************************************************************/

  /**
  * Starts the app
  * @param url: the start url
  * @param browserWindowPreferences = {}: preferences to pass to the browser window
  * @return this
  */
  create (url, browserWindowPreferences = {}) {
    const savedLocation = this.locationSaver.getSavedScreenLocation()
    const fullBrowserWindowPreferences = Object.assign({},
      this.defaultBrowserWindowPreferences(),
      browserWindowPreferences,
      savedLocation
    )

    // On darwin if we set the y coord too high we can end up not showing the titlebar
    if (process.platform === 'darwin' && fullBrowserWindowPreferences.y !== undefined) {
      fullBrowserWindowPreferences.y = Math.max(fullBrowserWindowPreferences.y, 25)
    }

    // Create the window
    this.window = new BrowserWindow(fullBrowserWindowPreferences)
    if (savedLocation.maximized && browserWindowPreferences.show !== false) {
      this.window.maximize()
    }
    this[settingStore.ui.showAppMenu ? 'showAppMenu' : 'hideAppMenu']()

    // Bind window event listeners
    this.window.on('close', (evt) => { this.emit('close', evt) })
    this.window.on('closed', (evt) => this.destroy(evt))
    this.bindMouseNavigation()

    // Register state savers
    this.locationSaver.register(this.window)

    // Bind other change listeners
    settingStore.on('changed', this.updateWindowMenubar)

    // Load the start url
    this.window.loadURL(url)

    return this
  }

  /**
  * Destroys the window
  * @param evt: the event that caused destroy
  */
  destroy (evt) {
    settingStore.removeListener('changed', this.updateWindowMenubar)
    if (this.window) {
      this.locationSaver.unregister(this.window)
      if (!this.window.isDestroyed()) {
        this.window.close()
        this.window.destroy()
      }
      this.window = null
    }
    this.emit('closed', evt)
  }

  /* ****************************************************************************/
  // Mouse Navigation
  /* ****************************************************************************/

  /**
  * Binds the mouse navigation shortcuts
  * Darwin is handled in the rendering thread
  */
  bindMouseNavigation () {
    if (process.platform === 'darwin') {
      this.window.on('scroll-touch-begin', () => {
        this.window.webContents.send(WB_WINDOW_DARWIN_SCROLL_TOUCH_BEGIN, {})
      })
      this.window.on('scroll-touch-end', () => {
        this.window.webContents.send(WB_WINDOW_DARWIN_SCROLL_TOUCH_END, {})
      })
    } else if (process.platform === 'win32') {
      this.window.on('app-command', (evt, cmd) => {
        switch (cmd) {
          case 'browser-backward': this.navigateBack(); break
          case 'browser-forward': this.navigateForward(); break
        }
      })
    }
  }

  /* ****************************************************************************/
  // State lifecycle
  /* ****************************************************************************/

  /**
  * Updates the menubar
  */
  updateWindowMenubar = (prev, next) => {
    this[settingStore.ui.showAppMenu ? 'showAppMenu' : 'hideAppMenu']()
  }

  /* ****************************************************************************/
  // Actions: Lifecycle
  /* ****************************************************************************/

  /**
  * Closes the window respecting any behaviour modifiers that are set
  * @return this
  */
  close () {
    this.window.close()
    return this
  }

  /**
  * Blurs a window
  * @return this
  */
  blur () {
    this.window.blur()
    return this
  }

  /**
  * Focuses a window
  * @return this
  */
  focus () {
    this.window.focus()
    return this
  }

  /**
  * Reloads the webview
  * @return this
  */
  reload () {
    this.window.webContents.reload()
    return this
  }

  /**
  * Reloads the wavebox window
  * @return this
  */
  reloadWaveboxWindow () {
    this.window.webContents.reload()
    return this
  }

  /**
  * Navigates the content window backwards
  * @return this
  */
  navigateBack () {
    this.window.webContents.goBack()
    return this
  }

  /**
  * Navigates the content window forwards
  * @return this
  */
  navigateForward () {
    this.window.webContents.goForward()
    return this
  }

  /* ****************************************************************************/
  // Actions: Visibility
  /* ****************************************************************************/

  /**
  * Shows the window
  * @param restoreState=true: true to restore the saved window state
  * @return this
  */
  show (restoreState = true) {
    const windowRestore = restoreState ? this.locationSaver.getSavedScreenLocation() : undefined
    this.window.show()
    if (restoreState) {
      this.locationSaver.reapplySavedScreenLocation(windowRestore)
    }
    return this
  }

  /**
  * Hides the window
  * @return this
  */
  hide () {
    this.window.hide()
    return this
  }

  /**
  * Toggles fullscreen mode
  * @return this
  */
  toggleFullscreen () {
    if (this.window.isFullScreenable()) {
      this.window.setFullScreen(!this.window.isFullScreen())
    } else {
      this.window.maximize(!this.window.isMaximized())
    }
    return this
  }

  /* ****************************************************************************/
  // Actions: Dev
  /* ****************************************************************************/

  /**
  * Opens dev tools for this window
  * @return this
  */
  openDevTools () {
    this.window.webContents.openDevTools()
    return this
  }

  /**
  * Opens the wavebox dev tools for this window
  * @return this
  */
  openWaveboxDevTools () {
    this.window.webContents.openDevTools()
    return this
  }

  /**
  * Requests that the window returns resource usage
  * @return this
  */
  pingResourceUsage () {
    this.window.webContents.send(WB_PING_RESOURCE_USAGE, { })
    return this
  }

  /* ****************************************************************************/
  // Actions: Display
  /* ****************************************************************************/

  /**
  * Show the app menu
  * @return this
  */
  showAppMenu () {
    this.window.setMenuBarVisibility(true)
    return this
  }

  /**
  * Hide the app menu
  * @return this
  */
  hideAppMenu () {
    this.window.setMenuBarVisibility(false)
    return this
  }

  /* ****************************************************************************/
  // Actions: Misc
  /* ****************************************************************************/

  /**
  * Sets the download progress
  * @param v: the download progress to set
  * @return this
  */
  setProgressBar (v) {
    this.window.setProgressBar(v)
    return this
  }

  /* ****************************************************************************/
  // Actions: Find
  /* ****************************************************************************/

  /**
  * Starts finding in the mailboxes window
  * @return this
  */
  findStart () {
    this.window.webContents.send(WB_WINDOW_FIND_START, { })
    return this
  }

  /**
  * Finds the next in the mailbox window
  * @return this
  */
  findNext () {
    this.window.webContents.send(WB_WINDOW_FIND_NEXT, { })
    return this
  }

  /* ****************************************************************************/
  // Actions: Zoom
  /* ****************************************************************************/

  /**
  * Zooms the current window in
  * @return this
  */
  zoomIn () {
    this.window.webContents.send(WB_WINDOW_ZOOM_IN, { })
    return this
  }

  /**
  * Zooms the current window out
  * @return this
  */
  zoomOut () {
    this.window.webContents.send(WB_WINDOW_ZOOM_OUT, { })
    return this
  }

  /**
  * Resets the zoom on the current window
  * @return this
  */
  zoomReset () {
    this.window.webContents.send(WB_WINDOW_ZOOM_RESET, { })
    return this
  }

  /* ****************************************************************************/
  // Query
  /* ****************************************************************************/

  /**
  * @return true if the window is focused
  */
  isFocused () {
    return this.window.isFocused()
  }

  /**
  * @return true if the window is fullscreen
  */
  isFullScreen () {
    return this.window.isFullScreen()
  }

  /**
  * @return true if the window is visible
  */
  isVisible () {
    return this.window.isVisible()
  }

  /**
  * @return true if this window is destroyed
  */
  isDestroyed () {
    return this.window.isDestroyed()
  }
}

export default WaveboxWindow
