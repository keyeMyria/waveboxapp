const GoogleService = require('./GoogleService')

class GoogleMessengerService extends GoogleService {
  /* **************************************************************************/
  // Class
  /* **************************************************************************/

  static get type () { return GoogleService.SERVICE_TYPES.MESSENGER }

  /* **************************************************************************/
  // Class: Humanized
  /* **************************************************************************/

  static get humanizedType () { return 'Google Allo' }
  static get humanizedTypeShort () { return 'Allo' }
  static get humanizedLogos () {
    return [
      'images/google/logo_allo_32px.png',
      'images/google/logo_allo_48px.png',
      'images/google/logo_allo_64px.png',
      'images/google/logo_allo_128px.png'
    ]
  }

  /* **************************************************************************/
  // Class: Support
  /* **************************************************************************/

  static get supportsUnreadCount () { return true }
  static get supportsGuestNotifications () { return true }
  static get supportsTrayMessages () { return true }

  /* **************************************************************************/
  // Class: Creation
  /* **************************************************************************/

  /**
  * Creates a blank js object that can used to instantiate this service
  * @return a vanilla js object representing the data for this service
  */
  static createJS () {
    return Object.assign({}, super.createJS(), {
      sleepable: false
    })
  }

  /* **************************************************************************/
  // Properties
  /* **************************************************************************/

  get url () { return 'https://allo.google.com/web' }

  /* **************************************************************************/
  // Properties : Provider Details & counts etc
  /* **************************************************************************/

  get unreadCount () { return this._value_('unreadCount', 0) }
  get unreadCountUpdateTime () { return this._value_('unreadCountUpdateTime', 0) }
  get trayMessages () {
    const count = this.unreadCount
    return count === 0 ? [] : [
      {
        id: `auto_${count}`,
        text: `${count} new ${this.humanizedTypeShort} ${this.humanizedUnreadItemType}${count > 1 ? 's' : ''}`,
        date: this.unreadCountUpdateTime,
        data: {}
      }
    ]
  }
}

module.exports = GoogleMessengerService
