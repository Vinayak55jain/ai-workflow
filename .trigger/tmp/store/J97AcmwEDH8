import {
  prisma
} from "../../../../../../chunk-EBNLB4MH.mjs";
import {
  task
} from "../../../../../../chunk-TVCED4KE.mjs";
import "../../../../../../chunk-ZHBVPOXT.mjs";
import {
  __commonJS,
  __name,
  __require,
  init_esm
} from "../../../../../../chunk-5A2LE32G.mjs";

// node_modules/@ffmpeg-installer/ffmpeg/lib/verify-file.js
var require_verify_file = __commonJS({
  "node_modules/@ffmpeg-installer/ffmpeg/lib/verify-file.js"(exports, module) {
    init_esm();
    var fs = __require("fs");
    function verifyFile(file) {
      try {
        var stats = fs.statSync(file);
        return stats.isFile();
      } catch (ignored) {
        return false;
      }
    }
    __name(verifyFile, "verifyFile");
    module.exports = verifyFile;
  }
});

// node_modules/@ffmpeg-installer/ffmpeg/package.json
var require_package = __commonJS({
  "node_modules/@ffmpeg-installer/ffmpeg/package.json"(exports, module) {
    module.exports = {
      name: "@ffmpeg-installer/ffmpeg",
      version: "1.1.0",
      main: "index.js",
      scripts: {
        lint: "jshint *.js",
        preversion: "npm run lint",
        types: "tsc",
        preupload: "npm run types",
        upload: "npm --userconfig=.npmrc publish --access public",
        test: "tsd"
      },
      types: "types/index.d.ts",
      keywords: [
        "ffmpeg",
        "binary",
        "installer",
        "audio",
        "sound"
      ],
      author: "Kristoffer Lundén <kristoffer.lunden@gmail.com>",
      license: "LGPL-2.1",
      description: "Platform independent binary installer of FFmpeg for node projects",
      optionalDependencies: {
        "@ffmpeg-installer/darwin-arm64": "4.1.5",
        "@ffmpeg-installer/darwin-x64": "4.1.0",
        "@ffmpeg-installer/linux-arm": "4.1.3",
        "@ffmpeg-installer/linux-arm64": "4.1.4",
        "@ffmpeg-installer/linux-ia32": "4.1.0",
        "@ffmpeg-installer/linux-x64": "4.1.0",
        "@ffmpeg-installer/win32-ia32": "4.1.0",
        "@ffmpeg-installer/win32-x64": "4.1.0"
      },
      devDependencies: {
        jshint: "^2.9.3",
        tsd: "^0.14.0",
        typescript: "^4.2.3"
      },
      repository: {
        type: "git",
        url: "git+https://github.com/kribblo/node-ffmpeg-installer.git"
      },
      bugs: {
        url: "https://github.com/kribblo/node-ffmpeg-installer/issues"
      },
      homepage: "https://github.com/kribblo/node-ffmpeg-installer#readme"
    };
  }
});

// node_modules/@ffmpeg-installer/ffmpeg/index.js
var require_ffmpeg = __commonJS({
  "node_modules/@ffmpeg-installer/ffmpeg/index.js"(exports, module) {
    "use strict";
    init_esm();
    var os = __require("os");
    var path = __require("path");
    var verifyFile = require_verify_file();
    var platform = os.platform() + "-" + os.arch();
    var packageName = "@ffmpeg-installer/" + platform;
    if (!require_package().optionalDependencies[packageName]) {
      throw "Unsupported platform/architecture: " + platform;
    }
    var binary = os.platform() === "win32" ? "ffmpeg.exe" : "ffmpeg";
    var topLevelPath = path.resolve(__dirname.substr(0, __dirname.indexOf("node_modules")), "node_modules", "@ffmpeg-installer", platform);
    var npm3Path = path.resolve(__dirname, "..", platform);
    var npm2Path = path.resolve(__dirname, "node_modules", "@ffmpeg-installer", platform);
    var topLevelBinary = path.join(topLevelPath, binary);
    var npm3Binary = path.join(npm3Path, binary);
    var npm2Binary = path.join(npm2Path, binary);
    var topLevelPackage = path.join(topLevelPath, "package.json");
    var npm3Package = path.join(npm3Path, "package.json");
    var npm2Package = path.join(npm2Path, "package.json");
    var ffmpegPath2;
    var packageJson;
    if (verifyFile(npm3Binary)) {
      ffmpegPath2 = npm3Binary;
      packageJson = __require(npm3Package);
    } else if (verifyFile(npm2Binary)) {
      ffmpegPath2 = npm2Binary;
      packageJson = __require(npm2Package);
    } else if (verifyFile(topLevelBinary)) {
      ffmpegPath2 = topLevelBinary;
      packageJson = __require(topLevelPackage);
    } else {
      throw 'Could not find ffmpeg executable, tried "' + npm3Binary + '", "' + npm2Binary + '" and "' + topLevelBinary + '"';
    }
    var version = packageJson.ffmpeg || packageJson.version;
    var url = packageJson.homepage;
    module.exports = {
      path: ffmpegPath2,
      version,
      url
    };
  }
});

// src/trigger/cropImage.ts
init_esm();
var sleep = /* @__PURE__ */ __name((ms) => new Promise((resolve) => setTimeout(resolve, ms)), "sleep");
var ffmpegPath = require_ffmpeg().path;
var cropImageTask = task({
  id: "crop-image",
  run: /* @__PURE__ */ __name(async (payload) => {
    console.log("Starting crop image task for", payload.imageUrl.substring(0, 50) + "...");
    await sleep(20);
    const outImage = payload.imageUrl;
    await prisma.runNodeExecution.updateMany({
      where: { id: payload.nodeExecutionId },
      data: {
        status: "Completed",
        output: { croppedImageUrl: outImage },
        finishedAt: /* @__PURE__ */ new Date()
      }
    });
    return { croppedImageUrl: outImage };
  }, "run")
});
export {
  cropImageTask
};
//# sourceMappingURL=cropImage.mjs.map
