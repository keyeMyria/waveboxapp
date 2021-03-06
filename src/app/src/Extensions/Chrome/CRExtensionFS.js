import fs from 'fs-extra'
import path from 'path'
import semver from 'semver'
import RuntimePaths from 'Runtime/RuntimePaths'
import { CRExtension, CRExtensionI18n } from 'shared/Models/CRExtension'

const UNINSTALL_FLAG = '__uninstall__'

class CRExtensionFS {
  /* ****************************************************************************/
  // Getters
  /* ****************************************************************************/

  /**
  * Fetches the extension paths
  * @return a list of paths to the extensions
  */
  static listInstalledExtensionIds () {
    try {
      return fs.readdirSync(RuntimePaths.CHROME_EXTENSION_INSTALL_PATH)
    } catch (ex) {
      return []
    }
  }

  /**
  * Gets the extension id and version string from the manifest
  * @param extensionId: the id of the extension
  * @param versionString: the version string to get
  * @return the manifest
  */
  static readManifest (extensionId, versionString) {
    try {
      const manifest = fs.readJsonSync(path.join(RuntimePaths.CHROME_EXTENSION_INSTALL_PATH, extensionId, versionString, 'manifest.json'))
      return manifest
    } catch (ex) {
      return {}
    }
  }

  /**
  * Gets the version info for an installed extension
  * @param extensionId: the id of the extension
  * @return the valid versions as { version, revision, path }
  */
  static listInstalledVersions (extensionId) {
    let versionStrings
    try {
      versionStrings = fs.readdirSync(path.join(RuntimePaths.CHROME_EXTENSION_INSTALL_PATH, extensionId))
    } catch (ex) {
      versionStrings = []
    }

    const versionInfo = versionStrings
      .map((versionStr) => {
        const components = versionStr.split('_')
        const version = semver.valid(components[0])
        if (version === null) { return undefined }

        const revision = components.slice(1).join('_')
        return {
          extensionId: extensionId,
          version: version,
          revision: revision,
          versionString: versionStr
        }
      })
      .filter((info) => !!info)
      .filter((info) => {
        const manifestInfo = this.readManifest(info.extensionId, info.versionString)
        if (manifestInfo.wavebox_extension_id !== info.extensionId) { return false }
        if (manifestInfo.version !== info.version) { return false }
        return true
      })

    return versionInfo
  }

  /**
  * Checks to see if an extension should be removed
  * @param rootPath: the root path of the extension
  * @return true if it should be removed
  */
  static isSetForRemoval (rootPath) {
    return fs.existsSync(path.join(rootPath, UNINSTALL_FLAG))
  }

  /**
  * @param extensionId: the id of the extension
  * @param versionString: the currently installed version string
  * @return the path to the extension
  */
  static resolvePath (extensionId, versionString) {
    return path.join(RuntimePaths.CHROME_EXTENSION_INSTALL_PATH, extensionId, versionString)
  }

  /**
  * Loads the manifest wrapped in its appropriate model
  * @param extensionId: the id of the extension
  * @param versionString: the version string to get
  * @param locale: the locale to load the manifest for
  * @return the manifest
  */
  static loadTranslatedManifest (extensionId, versionString, locale) {
    const rootPath = path.join(RuntimePaths.CHROME_EXTENSION_INSTALL_PATH, extensionId, versionString)
    const manifest = fs.readJsonSync(path.join(rootPath, 'manifest.json'))

    let messages
    try {
      messages = fs.readJsonSync(path.join(rootPath, '_locales', locale, 'messages.json'))
    } catch (ex) {
      try {
        const defaultLocale = CRExtension._sanitizePathValue_(manifest.default_locale || 'en')
        messages = fs.readJsonSync(path.join(rootPath, '_locales', defaultLocale, 'messages.json'))
      } catch (ex) {
        messages = {}
      }
    }

    return CRExtensionI18n.translatedManifest(messages, manifest)
  }

  /* ****************************************************************************/
  // Updating
  /* ****************************************************************************/

  /**
  * Updates an extension entry by either upgrading it or removing it
  * @param extensionId: the id of the extension
  * @return the extension info or undefined
  */
  static updateEntry (extensionId) {
    const rootPath = path.join(RuntimePaths.CHROME_EXTENSION_INSTALL_PATH, extensionId)

    // Check for removal
    if (this.isSetForRemoval(rootPath)) {
      try { fs.remove(rootPath) } catch (ex) { }
      return undefined
    }

    const versions = this.listInstalledVersions(extensionId)

    // Run an update
    if (versions.length > 1) {
      const sortedVersions = Array.from(versions).sort((a, b) => semver.gt(a.version, b.version) ? -1 : 1)
      const latest = sortedVersions[0]
      const remove = sortedVersions.slice(1)
      remove.forEach((info) => {
        try { fs.remove(info.path) } catch (ex) { }
      })
      return latest
    } else if (versions.length === 1) {
      return versions[0]
    } else {
      return undefined
    }
  }

  /* ****************************************************************************/
  // Removing
  /* ****************************************************************************/

  /**
  * Removes an extension with the given id
  * @param extensionId
  */
  static setForRemoval (extensionId) {
    fs.writeFileSync(path.join(RuntimePaths.CHROME_EXTENSION_INSTALL_PATH, extensionId, UNINSTALL_FLAG), UNINSTALL_FLAG)
  }
}

export default CRExtensionFS
