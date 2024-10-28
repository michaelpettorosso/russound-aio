// Asynchronous JavaScript client for Russound RIO.

import { FLAGS_BY_VERSION } from './const.js';
import { UnsupportedFeatureError } from './exceptions.js';

const _fw_pattern = /^(?<major>\d{1,2})\.(?<minor>\d{2})\.(?<patch>\d{2})$/;

function versionsByFlags() {
    var retObj = {};
    for (const [version, flags] of Object.entries(FLAGS_BY_VERSION))
      for (var flag of flags)
        retObj[flag] = version;
    return retObj;  
  } 
  
function raiseUnsupportedFeature(apiVer, flag) {
    if (!isFeatureSupported(apiVer, flag)) {
        const err = `Russound feature ${flag} not supported in api v${apiVer}`;
        throw new UnsupportedFeatureError(err);
    }
}

function isFeatureSupported(apiVer, flag) {
    var versionFlags = versionsByFlags()
    return isFwVersionHigher(apiVer, versionFlags[flag]);
}

function isFwVersionHigher(fwA, fwB) {
    const aMatch = fwA.match(_fw_pattern);
    const bMatch = fwB.match(_fw_pattern);

    if (!(aMatch && bMatch)) {
        return false;
    }

    const aMajor = parseInt(aMatch.groups.major);
    const aMinor = parseInt(aMatch.groups.minor);
    const aPatch = parseInt(aMatch.groups.patch);

    const bMajor = parseInt(bMatch.groups.major);
    const bMinor = parseInt(bMatch.groups.minor);
    const bPatch = parseInt(bMatch.groups.patch);

    return (
        (aMajor > bMajor) ||
        (aMajor === bMajor && aMinor > bMinor) ||
        (aMajor === bMajor && aMinor === bMinor && aPatch >= bPatch)
    );
}

function controllerDeviceStr(controllerId) {
    return `C[${controllerId}]`;
}

function zoneDeviceStr(controllerId, zoneId) {
    return `C[${controllerId}].Z[${zoneId}]`;
}

function sourceDeviceStr(sourceId) {
    return `S[${sourceId}]`;
}

function getMaxZones(model) {
    if (["MCA-88", "MCA-88X", "MCA-C5"].includes(model)) {
        return 8;
    }
    if (["MCA-66", "MCA-C3"].includes(model)) {
        return 6;
    }
    return 1;
}

function isRnetCapable(model) {
    return ["MCA-88X", "MCA-88", "MCA-66", "MCA-C5", "MCA-C3"].includes(model);
}

function mapRioToDict(state, branch, leaf, value) {
    const path = branch.match(/\w+\[?\d*]?/g);
    let current = state;
    for (const part of path) {
        const match = part.match(/(\w+)\[(\d+)]/);
        if (match) {
            const [, key, index] = match;
            const indexNum = parseInt(index);
            if (!(key in current)) {
                current[key] = {};
            }
            if (!(indexNum in current[key])) {
                current[key][indexNum] = {};
            }
            current = current[key][indexNum];
        } else {
            if (!(part in current)) {
                current[part] = {};
            }
            current = current[part];
        }
    }

    // Set the leaf and value in the final dictionary location
    current[leaf] = value;
}

export {
    raiseUnsupportedFeature,
    isFeatureSupported,
    isFwVersionHigher,
    controllerDeviceStr,
    zoneDeviceStr,
    sourceDeviceStr,
    getMaxZones,
    isRnetCapable,
    mapRioToDict
};

