'use strict';
/**
 * desktop/preload.js
 * Context bridge aman untuk Desktop App Electron Client.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopApp', {
  isDesktop: true,
  version: '1.0.0',
  getServerUrl: () => ipcRenderer.invoke('get-server-url'),
  setServerUrl: (url) => ipcRenderer.invoke('set-server-url', url),
  testConnection: (url) => ipcRenderer.invoke('test-connection', url),
  reloadPage: () => ipcRenderer.send('reload-page'),
  openConnectScreen: () => ipcRenderer.send('open-connect-screen'),
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  maximizeWindow: () => ipcRenderer.send('maximize-window'),
  closeWindow: () => ipcRenderer.send('close-window'),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  notify: (title, body) => ipcRenderer.send('desktop-notify', { title, body })
});
