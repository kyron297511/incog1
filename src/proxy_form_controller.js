// Copyright (c) 2011 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @fileoverview This file implements the ProxyFormController class, which
 * wraps a form element with logic that enables implementation of proxy
 * settings.
 *
 * @author mkwst@google.com (Mike West)
 */

/**
 * Wraps the proxy configuration form, binding proper handlers to its various
 * `change`, `click`, etc. events in order to take appropriate action in
 * response to user events.
 *
 * @param {string} headerId The header's DOM ID.
 * @param {string} formId The form's DOM ID.
 * @constructor
 */
var ProxyFormController = function(headerId, formId) {
  /**
   * The wrapped form element
   * @type {Node}
   * @private
   */
  this.header_ = document.getElementById(headerId);
  this.form_ = document.getElementById(formId);

  if (!this.header_?.nodeName == 'H1')
    throw `${headerId} is not an H1`;
  if (!this.form_?.nodeName == 'FORM')
    throw `${formId} is not a form`;

  /**
   * Cached references to the `fieldset` groups that define the configuration
   * options presented to the user.
   *
   * @type {NodeList}
   * @private
   */
  this.configGroups_ = document.querySelectorAll(`#${formId} > fieldset`);

  this.bindEventHandlers_();
  this.readCurrentState_();

  // Handle errors
  this.handleProxyErrors_();
};

///////////////////////////////////////////////////////////////////////////////

/**
 * The proxy types we're capable of handling.
 * @enum {string}
 */
ProxyFormController.ProxyTypes = {
  AUTO: 'auto_detect',
  PAC: 'pac_script',
  DIRECT: 'direct',
  FIXED: 'fixed_servers',
  SYSTEM: 'system'
};

ProxyFormController.RestrictRtcTypes = {
  DEFAULT: 'default',
  RESTRICT: 'disable_non_proxied_udp'
};

/**
 * The window types we're capable of handling.
 * @enum {int}
 */
ProxyFormController.WindowTypes = {
  REGULAR: 1,
  INCOGNITO: 2
};

/**
 * The extension's level of control of Chrome's roxy setting
 * @enum {string}
 */
ProxyFormController.LevelOfControl = {
  AVAILABLE: 'controllable_by_this_extension',
  CONTROLLING: 'controlled_by_this_extension'
};

///////////////////////////////////////////////////////////////////////////////

ProxyFormController.prototype = {
  regularConfig_: {
    proxy: null,
    restrictRtc: null
  },

  incognitoConfig_: {
    proxy: null,
    restrictRtc: null
  },

  /**
   * Do we have access to incognito mode?
   * @type {boolean}
   * @private
   */
  isAllowedIncognitoAccess_: false,

  /**
   * @return {string} The PAC file URL (or an empty string).
   */
  get pacURL() {
    return document.getElementById('autoconfigURL').value;
  },


  /**
   * @param {!string} value The PAC file URL.
   */
  set pacURL(value) {
    document.getElementById('autoconfigURL').value = value;
  },


  /**
   * @return {string} The PAC file data (or an empty string).
   */
  get manualPac() {
    return document.getElementById('autoconfigData').value;
  },


  /**
   * @param {!string} value The PAC file data.
   */
  set manualPac(value) {
    document.getElementById('autoconfigData').value = value;
  },


  /**
   * @return {Array<string>} A list of hostnames that should bypass the proxy.
   */
  get bypassList() {
    return document.getElementById('bypassList').value.split(/\s*(?:,|^)\s*/m);
  },


  /**
   * @param {?Array<string>} data A list of hostnames that should bypass
   *     the proxy. If empty, the bypass list is emptied.
   */
  set bypassList(data) {
    if (!data)
      data = [];
    document.getElementById('bypassList').value = data.join(', ');
  },


  /**
   * @see http://code.google.com/chrome/extensions/trunk/proxy.html
   * @return {?ProxyServer} An object containing the proxy server host, port,
   *     and scheme. If null, there is no single proxy.
   */
  get singleProxy() {
    var checkbox = document.getElementById('singleProxyForEverything');
    return checkbox.checked ? this.httpProxy : null;
  },


  /**
   * @see http://code.google.com/chrome/extensions/trunk/proxy.html
   * @param {?ProxyServer} data An object containing the proxy server host,
   *     port, and scheme. If null, the single proxy checkbox will be unchecked.
   */
  set singleProxy(data) {
    var checkbox = document.getElementById('singleProxyForEverything');
    checkbox.checked = !!data;

    if (data)
      this.httpProxy = data;

    if (checkbox.checked)
      checkbox.parentNode.parentNode.classList.add('single');
    else
      checkbox.parentNode.parentNode.classList.remove('single');
  },

  /**
   * @return {?ProxyServer} An object containing the proxy server host, port
   *     and scheme.
   */
  get httpProxy() {
    return this.getProxyImpl_('Http');
  },


  /**
   * @param {?ProxyServer} data An object containing the proxy server host,
   *     port, and scheme. If empty, empties the proxy setting.
   */
  set httpProxy(data) {
    this.setProxyImpl_('Http', data);
  },


  /**
   * @return {?ProxyServer} An object containing the proxy server host, port
   *     and scheme.
   */
  get httpsProxy() {
    return this.getProxyImpl_('Https');
  },


  /**
   * @param {?ProxyServer} data An object containing the proxy server host,
   *     port, and scheme. If empty, empties the proxy setting.
   */
  set httpsProxy(data) {
    this.setProxyImpl_('Https', data);
  },


  /**
   * @return {?ProxyServer} An object containing the proxy server host, port
   *     and scheme.
   */
  get ftpProxy() {
    return this.getProxyImpl_('Ftp');
  },


  /**
   * @param {?ProxyServer} data An object containing the proxy server host,
   *     port, and scheme. If empty, empties the proxy setting.
   */
  set ftpProxy(data) {
    this.setProxyImpl_('Ftp', data);
  },


  /**
   * @return {?ProxyServer} An object containing the proxy server host, port
   *     and scheme.
   */
  get fallbackProxy() {
    return this.getProxyImpl_('Fallback');
  },


  /**
   * @param {?ProxyServer} data An object containing the proxy server host,
   *     port, and scheme. If empty, empties the proxy setting.
   */
  set fallbackProxy(data) {
    this.setProxyImpl_('Fallback', data);
  },

  get restrictRtc() {
    var checkbox = document.getElementById('restrictRtc');
    return checkbox.checked ?
        ProxyFormController.RestrictRtcTypes.RESTRICT :
        ProxyFormController.RestrictRtcTypes.DEFAULT;
  },

  set restrictRtc(data) {
    var checkbox = document.getElementById('restrictRtc');
    checkbox.checked = (data == ProxyFormController.RestrictRtcTypes.RESTRICT);
  },

  /**
   * @param {string} type The type of proxy that's being set ("Http",
   *     "Https", etc.).
   * @return {?ProxyServer} An object containing the proxy server host,
   *     port, and scheme.
   * @private
   */
  getProxyImpl_: function(type) {
    var result = {
      scheme: document.getElementById('proxyScheme' + type).value,
      host: document.getElementById('proxyHost' + type).value,
      port: parseInt(document.getElementById('proxyPort' + type).value, 10)
    };
    return (result.scheme && result.host && result.port) ? result : undefined;
  },


  /**
   * A generic mechanism for setting proxy data.
   *
   * @see http://code.google.com/chrome/extensions/trunk/proxy.html
   * @param {string} type The type of proxy that's being set ("Http",
   *     "Https", etc.).
   * @param {?ProxyServer} data An object containing the proxy server host,
   *     port, and scheme. If empty, empties the proxy setting.
   * @private
   */
  setProxyImpl_: function(type, data) {
    if (!data)
      data = {scheme: 'http', host: '', port: ''};

    document.getElementById('proxyScheme' + type).value = data.scheme;
    document.getElementById('proxyHost' + type).value = data.host;
    document.getElementById('proxyPort' + type).value = data.port;
  },

///////////////////////////////////////////////////////////////////////////////

  /**
   * Calls the proxy API to read the current settings, and populates the form
   * accordingly.
   *
   * @private
   */
  readCurrentState_: async function() {
    this.isAllowedIncognitoAccess_ = await chrome.extension.isAllowedIncognitoAccess();
    const errs = ["Failed to read state:"];
    c = await chrome.proxy.settings.get({incognito: false});
    if (this.accessOk_(c, errs, "regular/proxy")) {
      this.regularConfig_.proxy = c.value;
    }
    c = await chrome.privacy.network.webRTCIPHandlingPolicy.get({incognito: false});
    if (this.accessOk_(c, errs, "regular/privacy")) {
      this.regularConfig_.restrictRtc = c.value;
    }
    if (this.isAllowedIncognitoAccess_) {
      c = await chrome.proxy.settings.get({incognito: true});
      if (this.accessOk_(c, errs, "incognito/proxy")) {
        this.incognitoConfig_.proxy = c.value;
      }
      c = await chrome.privacy.network.webRTCIPHandlingPolicy.get({incognito: true});
      if (this.accessOk_(c, errs, "incognito/privacy")) {
        this.incognitoConfig_.restrictRtc = c.value;
      }
    }

    if (this.isIncognitoMode_()) {
      this.recalcFormValues_(this.incognitoConfig_);
    } else {
      this.recalcFormValues_(this.regularConfig_);
    }

    if (errs.length > 1) {
      this.generateAlert_(errs.join('\r\n'));
    }
  },

  accessOk_: function(c, errs, what) {
    if (c.levelOfControl === ProxyFormController.LevelOfControl.AVAILABLE ||
        c.levelOfControl === ProxyFormController.LevelOfControl.CONTROLLING) {
      return true;
    }
    errs.push(`${what}: ${c.levelOfControl}`);
    return false;
  },

  /**
   * Binds event handlers for the various bits and pieces of the form that
   * are interesting to the controller.
   *
   * @private
   */
  bindEventHandlers_: function() {
    this.form_.addEventListener('click', this.dispatchFormClick_.bind(this));
  },


  /**
   * When a `click` event is triggered on the form, this function handles it by
   * analyzing the context, and dispatching the click to the correct handler.
   *
   * @param {Event} e The event to be handled.
   * @private
   * @return {boolean} True if the event should bubble, false otherwise.
   */
  dispatchFormClick_: function(e) {
    var t = e.target;

    // Case 1: "Apply"
    if (t.nodeName === 'INPUT' && t.getAttribute('type') === 'submit') {
      return this.applyChanges_(e);

    // Case 2: "Use the same proxy for all protocols" in an active section
    } else if (t.nodeName === 'INPUT' &&
               t.getAttribute('type') === 'checkbox' &&
               t.parentNode.parentNode.parentNode.classList.contains('active')
              ) {
      return this.toggleSingleProxyConfig_(e);

    // Case 3: "Flip to incognito mode."
    } else if (t.nodeName === 'BUTTON') {
      return this.toggleIncognitoMode_(e);

    // Case 4: Click on something random: maybe changing active config group?
    } else {
      // Walk up the tree until we hit `form > fieldset` or fall off the top
      while (t && (t.nodeName !== 'FIELDSET' ||
             t.parentNode.nodeName !== 'FORM')) {
        t = t.parentNode;
      }
      if (t) {
        this.changeActive_(t);
        return false;
      }
    }
    return true;
  },


  /**
   * Sets the form's active config group.
   *
   * @param {DOMElement} fieldset The configuration group to activate.
   * @private
   */
  changeActive_: function(fieldset) {
    for (var i = 0; i < this.configGroups_.length; i++) {
      var el = this.configGroups_[i];
      var radio = el.querySelector("input[type='radio']");
      if (el === fieldset) {
        el.classList.add('active');
        radio.checked = true;
      } else {
        el.classList.remove('active');
      }
    }
    this.recalcDisabledInputs_();
  },


  /**
   * Recalculates the `disabled` state of the form's input elements, based
   * on the currently active group, and that group's contents.
   *
   * @private
   */
  recalcDisabledInputs_: function() {
    var i, j;
    for (i = 0; i < this.configGroups_.length; i++) {
      var el = this.configGroups_[i];
      var inputs = el.querySelectorAll(
          "input:not([type='radio']), select, textarea");
      if (el.classList.contains('active')) {
        for (j = 0; j < inputs.length; j++) {
          inputs[j].removeAttribute('disabled');
        }
      } else {
        for (j = 0; j < inputs.length; j++) {
          inputs[j].setAttribute('disabled', 'disabled');
        }
      }
    }
  },

  /**
   * Handler called in response to click on form's submission button. Generates
   * the proxy configuration and passes it to `useCustomProxySettings`, or
   * handles errors in user input.
   *
   * Proxy errors (and the browser action's badge) are cleared upon setting new
   * values.
   *
   * @param {Event} e DOM event generated by the user's click.
   * @private
   */
  applyChanges_: async function(e) {
    e.preventDefault();
    e.stopPropagation();

    if (this.isIncognitoMode_()) {
      this.incognitoConfig_.proxy = this.generateProxyConfig_();
      this.incognitoConfig_.restrictRtc = this.restrictRtc;
    } else {
      this.regularConfig_.proxy = this.generateProxyConfig_();
      this.regularConfig_.restrictRtc = this.restrictRtc;
    }

    chrome.runtime.sendMessage({type: 'clearError'});
    try {
      await chrome.proxy.settings.set({
        scope: 'regular_only',
        value: this.regularConfig_.proxy
      });
      await chrome.privacy.network.webRTCIPHandlingPolicy.set({
        scope: 'regular_only',
        value: this.regularConfig_.restrictRtc
      });
    } catch (err) {
      this.generateAlert_(chrome.i18n.getMessage('errorSettingRegularProxy'));
      return;
    }
    if (this.incognitoConfig_.proxy) {
      try {
        await chrome.proxy.settings.set({
          scope: 'incognito_persistent',
          value: this.incognitoConfig_.proxy
        });
        await chrome.privacy.network.webRTCIPHandlingPolicy.set({
          scope: 'incognito_persistent',
          value: this.incognitoConfig_.restrictRtc
        });
      } catch (err) {
        this.generateAlert_(chrome.i18n.getMessage('errorSettingIncognitoProxy'));
        return;
      }
    }
    window.close();
  },

  /**
   * Generates an alert overlay inside the proxy's popup, then closes the popup
   * after a short delay.
   *
   * @param {string} msg The message to be displayed in the overlay.
   * @param {?boolean} close Should the window be closed?  Defaults to true.
   * @private
   */
  generateAlert_: function(msg, close) {
    var success = document.createElement('div');
    success.classList.add('overlay');
    success.setAttribute('role', 'alert');
    success.textContent = msg;
    document.body.appendChild(success);

    setTimeout(function() { success.classList.add('visible'); }, 10);
    setTimeout(function() { success.classList.remove('visible'); }, 4000);
  },


  /**
   * Parses the proxy configuration form, and generates a ProxyConfig object
   * that can be passed to `useCustomProxyConfig`.
   *
   * @see http://code.google.com/chrome/extensions/trunk/proxy.html
   * @return {ProxyConfig} The proxy configuration represented by the form.
   * @private
   */
  generateProxyConfig_: function() {
    var active = document.getElementsByClassName('active')[0];
    switch (active.id) {
      case ProxyFormController.ProxyTypes.SYSTEM:
        return {mode: 'system'};
      case ProxyFormController.ProxyTypes.DIRECT:
        return {mode: 'direct'};
      case ProxyFormController.ProxyTypes.PAC:
        var pacScriptURL = this.pacURL;
        var pacManual = this.manualPac;
        if (pacScriptURL)
          return {mode: 'pac_script',
                  pacScript: {url: pacScriptURL, mandatory: true}};
        else if (pacManual)
          return {mode: 'pac_script',
                  pacScript: {data: pacManual, mandatory: true}};
        else
          return {mode: 'auto_detect'};
      case ProxyFormController.ProxyTypes.FIXED:
        var config = {mode: 'fixed_servers'};
        if (this.singleProxy) {
          config.rules = {
            singleProxy: this.singleProxy,
            bypassList: this.bypassList
          };
        } else {
          config.rules = {
            proxyForHttp: this.httpProxy,
            proxyForHttps: this.httpsProxy,
            proxyForFtp: this.ftpProxy,
            fallbackProxy: this.fallbackProxy,
            bypassList: this.bypassList
          };
        }
        return config;
    }
  },

  /**
   * Sets the proper display classes based on the "Use the same proxy server
   * for all protocols" checkbox. Expects to be called as an event handler
   * when that field is clicked.
   *
   * @param {Event} e The `click` event to respond to.
   * @private
   */
  toggleSingleProxyConfig_: function(e) {
    var checkbox = e.target;
    if (checkbox.nodeName === 'INPUT' &&
        checkbox.getAttribute('type') === 'checkbox') {
      if (checkbox.checked)
        checkbox.parentNode.parentNode.classList.add('single');
      else
        checkbox.parentNode.parentNode.classList.remove('single');
    }
  },


  /**
   * Returns the form's current incognito status.
   *
   * @return {boolean} True if the form is in incognito mode, false otherwise.
   * @private
   */
  isIncognitoMode_: function(e) {
    return this.form_.parentNode.classList.contains('incognito');
  },


  /**
   * Toggles the form's incognito mode. Saves the current state to an object
   * property for later use, clears the form, and toggles the appropriate state.
   *
   * @param {Event} e The `click` event to respond to.
   * @private
   */
  toggleIncognitoMode_: function(e) {
    var div = this.form_.parentNode;
    var button = document.getElementsByTagName('button')[0];

    // Cancel the button click.
    e.preventDefault();
    e.stopPropagation();

    // If we can't access Incognito settings, throw a message and return.
    if (!this.isAllowedIncognitoAccess_) {
      var msg = "I'm sorry, Dave, I'm afraid I can't do that. " +
                "Please right-click my icon, select 'Manage\u00A0extension', " +
                "and enable 'Allow\u00A0in\u00A0Incognito' to use this feature.";
      this.generateAlert_(msg);
      return;
    }

    if (this.isIncognitoMode_()) {
      // In incognito mode, switching to cognito.
      this.incognitoConfig_.proxy = this.generateProxyConfig_();
      this.incognitoConfig_.restrictRtc = this.restrictRtc;
      div.classList.remove('incognito');
      this.recalcFormValues_(this.regularConfig_);
      button.innerText = 'Configure incognito window settings.';
      this.header_.innerHTML = 'Proxy Configuration (regular)';
    } else {
      // In cognito mode, switching to incognito.
      this.regularConfig_.proxy = this.generateProxyConfig_();
      this.regularConfig_.restrictRtc = this.restrictRtc;
      div.classList.add('incognito');
      this.recalcFormValues_(this.incognitoConfig_);
      button.innerText = 'Configure regular window settings.';
      this.header_.innerHTML = 'Proxy Configuration (incognito)';
    }
  },

  recalcFormValues_: function(config) {
    const c = config.proxy;
    const restrictRtc = config.restrictRtc;
    if (c == null || restrictRtc == null) {
      console.error("recalcFormValues_ missing data");
      return;
    }
    // Normalize `auto_detect`
    if (c.mode === 'auto_detect')
      c.mode = 'pac_script';
    // Activate one of the groups, based on `mode`.
    this.changeActive_(document.getElementById(c.mode));
    // Populate the PAC script
    if (c.pacScript) {
      if (c.pacScript.url)
        this.pacURL = c.pacScript.url;
    } else {
      this.pacURL = '';
    }
    // Evaluate the `rules`
    if (c.rules) {
      var rules = c.rules;
      if (rules.singleProxy) {
        this.singleProxy = rules.singleProxy;
      } else {
        this.singleProxy = null;
        this.httpProxy = rules.proxyForHttp;
        this.httpsProxy = rules.proxyForHttps;
        this.ftpProxy = rules.proxyForFtp;
        this.fallbackProxy = rules.fallbackProxy;
      }
      this.bypassList = rules.bypassList;
    } else {
      this.singleProxy = null;
      this.httpProxy = null;
      this.httpsProxy = null;
      this.ftpProxy = null;
      this.fallbackProxy = null;
      this.bypassList = '';
    }
    // Apply WebRTC restriction.
    this.restrictRtc = restrictRtc;
  },

  /**
   * Handle the case in which errors have been generated outside the context
   * of this popup.
   *
   * @private
   */
  handleProxyErrors_: function() {
    chrome.runtime.sendMessage(
        {type: 'getError'},
        this.handleProxyErrorHandlerResponse_.bind(this));
  },

  /**
   * Handles response from ProxyErrorHandler
   *
   * @param {{result: !string}} response The message sent in response to this
   *     popup's request.
   */
  handleProxyErrorHandlerResponse_: function(response) {
    if (response.result !== null) {
      var error = JSON.parse(response.result);
      console.error(error);
      // TODO(mkwst): Do something more interesting
      this.generateAlert_(
          chrome.i18n.getMessage(
              error.details ? 'errorProxyDetailedError' : 'errorProxyError',
              [error.error, error.details]));
    }
  }
};
