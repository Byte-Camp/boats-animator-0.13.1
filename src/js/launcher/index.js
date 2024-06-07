(function () {
  "use strict";
  const { ipcRenderer } = require("electron");

  //const newsFeed = require("./js/launcher/NewsFeed");

  const newProjectBtn = document.querySelector("#new-project");
  const openProjectBtn = document.querySelector("#open-project");
  const launcherMessage = document.querySelector("#launcher-message");
  const qAppVersion = document.querySelector("#app-version");

  // Get the version number from the manifest file
  qAppVersion.innerHTML = require("../package").version;

  checkDevelopmentMode();

  // Display the latest news
  //newsFeed.load("https://www.charlielee.uk/feed/boats-animator.json");

  // Open the animator when new project is pressed
  newProjectBtn.addEventListener("click", () => {
    ipcRenderer.send("win:switch-window", "animator");
  });

  // Open the folder selector when open project is pressed
  openProjectBtn.addEventListener("click", async () => {
    ipcRenderer.send("win:switch-window", "animator");
  });

  /**
   * Displays a message if the app is in development mode
   */
  async function checkDevelopmentMode() {
    let isPackaged = await ipcRenderer.invoke("app:is-packaged");

    if (!isPackaged) {
      // On macOS display additional warning about VS Code not working
      if (process.platform === "darwin") {
        launcherMessage.innerHTML = `
          <div class="highlight-body">
            <h2>
              <i class="fa fa-user-secret" aria-hidden="true"></i>
              App started in development mode on macOS
            </h2>

            Please ensure that you start this app from the built in Terminal application rather than Visual Studio Code or a similar integration.
            These will cause the app to crash due to the camera permission being unable to be set.
          </div>
        `;
      } else {
        launcherMessage.innerHTML = `
          <div class="highlight-body">
            <h2>
              <i class="fa fa-user-secret" aria-hidden="true"></i>
              App started in development mode
            </h2>
          </div>
        `;
      }
    }
  }
})();
