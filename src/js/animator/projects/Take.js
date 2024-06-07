(function () {
  "use strict";

  // UI imports
  const FrameReel = require("../core/FrameReel");
  const Loader = require("../core/Loader");
  const Notification = require("../../common/Notification");
  const OnionSkin = require("../ui/OnionSkin");
  const PlaybackCanvas = require("../ui/PlaybackCanvas");
  const StatusBar = require("../ui/StatusBar");

  // Common imports
  const AudioManager = require("../core/AudioManager");
  const File = require("../core/File");

  const preview = document.querySelector("#preview");

  /** Represents a single take (image sequence). */
  class Take {
    /**
     * Constructor for a new take
     * @param {Number} takeNumber The id of the take.
     * @param {String} saveDirPath The project save directory for the take.
     */
    constructor(takeNumber, saveDirPath) {
      // The id of the take
      this.takeNumber = takeNumber;
      // Project save directory
      this.saveDirPath = saveDirPath;
      // Array of captured Image elements
      this.capturedFrames = [];
      // Array of the paths of the captured images
      this.exportedFramesPaths = [];
      // The frame reel for the take
      this.frameReel = new FrameReel();
      // The onion skin for the take
      this.onionSkin = new OnionSkin();
      // Id of the last exported frame
      this.exportFrameId = 0;
      // Create a unique id for the take based on the current unix time
      // Used when generating the file names
      this.uniqueId = Math.floor(new Date().getTime() / 1000);

      console.log(`Created take ${this.takeNumber} with id ${this.uniqueId}`);
    }

    /**
     * TODO - build on code in issue-85 branch
     * Imports frames to the take from a given directory.
     * @param {String} path The folder to import frames from.
     */
    importFrames(dirPath) {
      const fs = require('fs');
      const path = require('path');
      var self = this;
    
      return new Promise((resolve, reject) => {
        fs.readdir(dirPath, (err, files) => {
          if (err) return reject(err);
          files = files.filter(file => /\.(jpg|jpeg|png)$/.test(file));
    
          if (files.length === 0) {
            return reject('No image files found in the directory.');
          }
    
          const loadPromises = files.map((file, index) => {
            return new Promise((resolve, reject) => {
              const filePath = path.join(dirPath, file);
              const img = new Image();
              img.src = filePath;
    
              img.onload = () => {
                try {
                  // Store the image data
                  self.capturedFrames.push(img);
                  var id = self.getTotalFrames();
                  console.info(`Captured frame: ${id}`);

                  // Update status bar and frame reel
                  StatusBar.setTotalFrames(id);
                  StatusBar.setCurrentFrame(id + 1);
                  self.frameReel.addFrame(id, img.src);
                  self.frameReel.setFrameThumbnail(id, img.src);

                  self._updateOnionSkin();
                  self.exportedFramesPaths.push(filePath);
                  resolve();
                } catch (error) {
                  console.error(`Error processing image at ${filePath}:`, error);
                  reject(`Error processing image at ${filePath}`);
                }
              };
    
              img.onerror = (error) => {
                console.error(`Failed to load image at ${filePath}:`, error);
                reject(`Failed to load image at ${filePath}`);
              };
            });
          });
    
          Promise.all(loadPromises)
            .then(() => {
              console.log(this.getTotalFrames());
              console.log(this.capturedFrames);
              resolve(`Imported ${files.length} frames.`);
            })
            .catch((error) => {
              reject(error);
            });
        });
      });
    }

    /**
     * Captures a frame from the preview feed and adds it to the take.
     */
    captureFrame() {
      var self = this;
      console.log(self.getTotalFrames());
      console.log(self.capturedFrames);
      return new Promise(function (resolve, reject) {
        // Prevent taking frames without a set output path
        if (!self.saveDirPath) {
          return reject("A save directory must be first set!");
        }

        // Prevent taking frames if the output path is invalid
        if (!File.makeDirIfNotExists(self.saveDirPath)) {
          return reject(`Unable to capture frame as failed to create save directory at ${self.saveDirPath}`);
        }

        // Draw the image on the canvas
        PlaybackCanvas.setDimensions(preview.videoWidth, preview.videoHeight);
        PlaybackCanvas.drawImage(preview);

        // Convert the frame to a PNG
        PlaybackCanvas.getBlob(function (blob) {
          // Play a camera sound
          AudioManager.play("audio/camera.wav");

          // Create a new image object
          var frame = new Image();
          var url = URL.createObjectURL(blob);
          frame.src = url;

          // Store the image data
          self.capturedFrames.push(frame);
          var id = self.getTotalFrames();
          console.info(`Captured frame: ${id}`);

          // Update status bar and frame reel
          StatusBar.setTotalFrames(id);
          StatusBar.setCurrentFrame(id + 1);
          self.frameReel.addFrame(id, self.capturedFrames[id - 1].src);
          self.frameReel.setFrameThumbnail(id, self.capturedFrames[id - 1].src);

          self._updateOnionSkin();
          self._exportFrame(blob);
          resolve(`Captured frame: ${id}`);
        });
      });
    }

    /**
     * Deletes a frame from the take.
     * @param {Number} id The id of the frame to delete.
     */
    deleteFrame(id) {
      File.delete(this.exportedFramesPaths[id - 1], {
        success: function () {
          Notification.success("File successfully deleted.");
        }
      });

      // Remove the frame from the take
      this.exportedFramesPaths.splice(id - 1, 1);
      this.capturedFrames.splice(id - 1, 1);

      // Update status bar and frame reel
      StatusBar.setTotalFrames(this.getTotalFrames());
      this.frameReel.removeFrame(id);

      this._updateOnionSkin();

      console.info(`Total frames captured: ${this.getTotalFrames()}`);
    }

    /**
     * "Conforms" a take by renaming each captured frame to be sequential.
     * @param {Boolean} notify Display a notification when the process completes/fails
     * @returns {Boolean} Returns true if conform is successful, false if there is an error
     */
    /*async conformTake(notify = true) {
      let self = this;
      let outputDir = this.saveDirPath;
      let promisesList = [];
      let response = null;

      // Return if no captured frames
      if (this.getTotalFrames() < 1) {
        return true;
      }

      try {
        Loader.show("Conforming take");

        // Give all of the files a temporary name
        // (required because async renaming could cause naming conflicts otherwise)
        for (let i = 0; i < self.getTotalFrames(); i++) {
          let oldFilePath = self.exportedFramesPaths[i];
          let newFilePath = oldFilePath.replace(/\.png$/,".tmp.png");

          promisesList.push(File.renamePromise(oldFilePath, newFilePath));
          self.exportedFramesPaths[i] = newFilePath;
        }
        await Promise.all(promisesList);

        // Give the files their new name
        promisesList = [];
        for (let i = 0; i < self.getTotalFrames(); i++) {
          let oldFilePath = self.exportedFramesPaths[i];
          let newFileName = this.buildFileName(Take.getPaddedFrameNumber(i+1));
          let newFilePath = `${outputDir}/${newFileName}`;

          promisesList.push(File.renamePromise(oldFilePath, newFilePath));
          self.exportedFramesPaths[i] = newFilePath;
        }
        await Promise.all(promisesList);

        // Reset last export frame id
        self.exportFrameId = self.getTotalFrames();

        if (notify) {
          Notification.success("Conform take successfully completed");
        }
        response = true;

      } catch (err) {
        if (notify) {
          Notification.error("Error renaming file with conform take");
        }
        response = false;

      } finally {
        Loader.hide();
        return response;
      }
    }*/

    async conformTake(notify = true) {
      var self = this;
      let outputDir = this.saveDirPath;
      let response = null;
    
      // Return if no captured frames
      if (this.getTotalFrames() < 1) {
        return true;
      }
    
      try {
        Loader.show("Conforming take");
    
        console.log("Renaming files");
        for (let i = 0; i < self.getTotalFrames(); i++) {
          let oldFilePath = self.exportedFramesPaths[i];
          let newFileName = this.buildFileName(Take.getPaddedFrameNumber(i + 1));
          console.log(newFileName);
          let newFilePath = `${outputDir}/${newFileName}`;
    
          try {
            await File.renamePromise(oldFilePath, newFilePath);
            self.exportedFramesPaths[i] = newFilePath;
            console.log(`Renamed ${oldFilePath} to ${newFilePath}`);
          } catch (error) {
            console.error(`Error renaming file ${oldFilePath} to ${newFilePath}:`, error);
            throw error; // Re-throw to be caught by the outer catch
          }
        }
    
        // Reset last export frame id
        self.exportFrameId = self.getTotalFrames();
    
        if (notify) {
          Notification.success("Conform take successfully completed");
        }
        response = true;
    
      } catch (err) {
        if (notify) {
          Notification.error("Error renaming file with conform take");
        }
        response = false;
    
      } finally {
        Loader.hide();
        return response;
      }
    }

    /**
     * The total number of frames in the take.
     */
    getTotalFrames() {
      return this.capturedFrames.length;
    }

    /**
     * Writes a frame to the disk and stores the path.
     * @param {Blob} blob The Blob object containing image data to save.
     */
    _exportFrame(blob) {
      this.exportFrameId++;
      let id = this.exportFrameId;
      let fileName = this.buildFileName(Take.getPaddedFrameNumber(id));

      // Make the output directory if it does not exist
      // todo outputDir should eventually be ${this.saveDirPath}/${this.takeNumber}
      let outputDir = this.saveDirPath;

      // Create an absolute path to the destination location
      var outputPath = `${outputDir}/${fileName}`;

      // Save the frame to disk
      var reader = new FileReader()
      reader.onload = function () {
        // Convert the frame blob to buffer
        var buffer = new Buffer.from(reader.result);
        File.write(outputPath, buffer);
      }
      reader.readAsArrayBuffer(blob);

      // Store the location of the exported frame
      this.exportedFramesPaths.push(outputPath);
    }

    /**
     * Updates the onion skin frame to be the last frame captured.
     */
    _updateOnionSkin() {
      if (this.getTotalFrames() > 0) {
        // Update onion skin frame
        this.onionSkin.setFrame(this.capturedFrames[this.getTotalFrames() - 1].src);
      } else {
        // Clear the onion skin window
        this.onionSkin.clear();
      }
    }

    /**
     * Makes the file name for a frame with a given id
     * @param {String} frameId The id of the frame (or some clever wildcard thing)
     */
    buildFileName(frameId) {
      return `ba_${this.uniqueId}_frame_${frameId}.png`;
    }

    /**
     * Converts a frame number into the padded zero format used in file names.
     * @param {Integer} frameNumber The id of the frame to pad
     */
    static getPaddedFrameNumber(frameNumber) {
      // Note the massive assumption that no one will capture more than 99999 frames has been made
      let zeros = "00000";
      return `${zeros.substring(0, zeros.length - frameNumber.toString().length)}${frameNumber}`;
    }
    /*static getPaddedFrameNumber(frameNumber) {
      return String(frameNumber).padStart(5, '0');
    }*/
  }

  module.exports = Take;
}());