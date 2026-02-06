import { app, dialog } from 'electron';
import { autoUpdater } from 'electron';

const isDev = !app.isPackaged;

let updateAvailable = false;

export function initAutoUpdater(): void {
  if (isDev) return;

  const server = 'https://update.electronjs.org';
  const feed = `${server}/whisperall/whisperall/${process.platform}-${process.arch}/${app.getVersion()}`;

  autoUpdater.setFeedURL({ url: feed });

  autoUpdater.on('update-available', () => {
    updateAvailable = true;
  });

  autoUpdater.on('update-downloaded', (_event, releaseNotes, releaseName) => {
    dialog.showMessageBox({
      type: 'info',
      buttons: ['Restart', 'Later'],
      title: 'Update Available',
      message: releaseName ?? 'A new version is available.',
      detail: 'A new version has been downloaded. Restart to apply the update.',
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall();
    });
  });

  autoUpdater.on('error', () => {
    // Silent: auto-update errors should not disrupt the user
  });

  // Check for updates every 4 hours
  autoUpdater.checkForUpdates();
  setInterval(() => autoUpdater.checkForUpdates(), 4 * 60 * 60 * 1000);
}

export function isUpdateAvailable(): boolean {
  return updateAvailable;
}
