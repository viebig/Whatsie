import dialog from 'dialog';
import yargs from 'yargs';
import path from 'path';
import app from 'app';

import filePaths from './utils/file-paths';
import manifest from '../../package.json';

// Handle uncaught exceptions
process.on('uncaughtException', function(ex) {
  const isDevRelease = manifest.distrib == 'unset';
  if (isDevRelease) {
    logFatal('uncaught exception', ex.message);
  } else {
    dialog.showErrorBox('JavaScript error in the main process', ex.stack);
    logFatal(ex);
  }
});

(function() {
  // Define the CLI arguments and parse them
  const cliArgs = process.argv.slice(1, process.argv.length);
  const options = yargs(cliArgs)
    .usage('Usage: $0 [options]')
    .option('os-startup', {
      type: 'boolean',
      description: 'Flag to indicate the app is being ran by the OS on startup.'
    })
    .option('portable', {
      type: 'boolean',
      description: 'Run in portable mode.'
    })
    .option('debug', {
      type: 'boolean',
      description: 'Run in debug mode.'
    })
    .option('repl', {
      type: 'boolean',
      description: 'Listen for REPL connections on port 3499.'
    })
    .option('mas', {
      type: 'boolean',
      description: 'Run in Mac App Store release mode.'
    })
    .option('version', {
      type: 'boolean',
      description: 'Print the app version.',
      alias: 'v'
    })
    .option('squirrel-install', {
      type: 'boolean',
      description: 'Squirrel.Windows flag, called when the app is installed.'
    })
    .option('squirrel-uninstall', {
      type: 'boolean',
      description: 'Squirrel.Windows flag, called after the app is updated.'
    })
    .option('squirrel-updated', {
      type: 'boolean',
      description: 'Squirrel.Windows flag, called when the app is uninstalled.'
    })
    .option('squirrel-obsolete', {
      type: 'boolean',
      description: 'Squirrel.Windows flag, called before updating to a new version.'
    })
    .option('squirrel-firstrun', {
      type: 'boolean',
      description: 'Squirrel.Windows flag, called only once after installation.'
    })
    .help('help', 'Print this help message.').alias('help', 'h')
    .epilog('Coded with <3 by ' + manifest.author)
    .argv;

  global.manifest = manifest;
  global.options = options;

  options.portable = options.portable || !!manifest.portable;
  options.debug = options.debug || !!process.env.DEBUG;

  log('cli args parsed', options);
  if (options.debug) {
    log('debug mode enabled');
  }

  // Change the userData path if in portable mode
  if (options.portable) {
    log('running in portable mode');
    const userDataPath = path.join(filePaths.getAppDir(), 'data');
    log('set userData path', userDataPath);
    app.setPath('userData', userDataPath);
  }

  // Import prefs now so the correct userData path is used
  const prefs = require('./utils/prefs').default;

  // Check for Squirrel.Windows CLI args
  if (process.platform == 'win32') {
    const SquirrelEvents = require('./components/squirrel-events').default;
    if (SquirrelEvents.check(options)) {
      log('Squirrel.Windows event detected');
      return;
    }
  }

  // Quit the app immediately if this pref is set
  if (prefs.get('launch-quit')) {
    log('launch-quit pref is true, quitting');
    prefs.unsetSync('launch-quit');
    return app.quit();
  }

  // Print the version and exit
  if (options.version) {
    console.log(`${app.getName()} ${app.getVersion()}`);
    console.log(`Electron ${process.versions.electron}`);
    console.log(`Chromium ${process.versions.chrome}`);
    return app.quit();
  }

  // Enforce single instance
  const isDuplicateInstance = app.makeSingleInstance(() => {
    if (global.application) {
      const mainWindow = global.application.mainWindowManager.window;
      if (mainWindow) {
        if (mainWindow.isMinimized()) {
          mainWindow.restore();
        }
        mainWindow.focus();
      }
    }
    return true;
  });

  if (isDuplicateInstance) {
    log('another instance of the app is already running');
    return app.quit();
  }

  // Enable the crash reporter
  if (!process.mas) {
    if (manifest.crashReporter && manifest.crashReporter.url) {
      if (prefs.get('analytics-track')) {
        app.on('will-finish-launching', function() {
          log('will finish launching');

          // Crash reporter
          const reporterOptions = {
            productName: manifest.productName,
            companyName: manifest.win.companyName,
            submitURL: manifest.crashReporter.url,
            autoSubmit: true
          };

          log('starting crash reporter', JSON.stringify(reporterOptions));
          const CrashReporter = require('crash-reporter');
          CrashReporter.start(reporterOptions);
        });
      } else {
        log('analytics disabled, so crash reporter disabled');
      }
    } else {
      log('crash reporter url not configured');
    }
  } else {
    log('mas release, crash reporter disabled');
  }

  // Create the main app object and init
  app.on('ready', function() {
    log('ready, launching app');
    const Application = require('./application').default;
    global.application = new Application(manifest, options);
    global.application.init();
    global.ready = true;
  });

  // If the REPL is enabled, launch it
  if (options.repl) {
    require('./utils/repl').createServer(3499);
  }
})();
