# russound-aio
[![npm](https://img.shields.io/npm/dt/russound-aio.svg)](https://www.npmjs.com/package/russound-aio)
[![npm](https://img.shields.io/npm/l/russound-aio.svg)](https://www.npmjs.com/package/russound-aio)

[![NPM Version](https://img.shields.io/npm/v/russound-aio.svg)](https://www.npmjs.com/package/russound-aio)

Javascript socket library for Russound AIO

# Description

Javascript library that allows you to connect and controll your Russound AIO devices.

This library was primarily developed to be used within a Homebridge environment but may used by itself, see demo
folder for example of how to connect and interact with device   

# Changelog
* Initial Release.

# To Do

Only supports one controller at the moment

# Installation

As a prerequisite ensure that the Russound device is controllable using the Russound iOS app.
You also need to have [git](https://github.com/git/git) installed.

1. Install russound using: npm install russound.aio


Example code :
```js

```

### Config Explanation:
The names Zone1, Zone2, Zone3, Zone4, Zone5 and Zone6 should match the Zone names given in the Russound Controller configuration (the names in the Russound App)

The names Source1, Source2, Source3, Source4, Source5 and Source6 should match the Source names given in the Russound Controller configuration (the names in the Russound App)
  
  Any non configured sources identified as 'N/A' will be ignored

With this configuration you can define which sources are attached to which zones, the Russound API doesn't identify the configuration correctly.
That is, if different sources are selected for different zones in the Russound Controller configuration there is no way to determine this through the API. 
The Russound App doesn't handle this, I've added the capability to manage 

###

| Fields                 | Description                                                        | Default                                                                   | Required |
|------------------------|--------------------------------------------------------------------|---------------------------------------------------------------------------|----------|
| name                   | Name to use for the Russound platform.                             |                                                                           | No       |
| addRemote              | Add Remotes For Each Zone.                                 |                                                                           | No       |
`controllers` configuration parameters:

| Fields                 | Description                                                        | Default                                                                   | Required |
|------------------------|--------------------------------------------------------------------|---------------------------------------------------------------------------|----------|
| name                   | Name to use for this Russound Controller.                          | MCA-66                                                                    | No       |
| ip                     | IP address of your Russound Controller.                            |                                                                           | Yes      |

`zones` zones parameters:
| Fields                 | Description                                                        | Default                                                                   | Required |
|------------------------|--------------------------------------------------------------------|---------------------------------------------------------------------------|----------|
| name                   | Name of this zone configured on the Russound Controller.           |                                                                           | Yes      |
| display_name           | Name that you want the zone to display.                            | if blank it is name                                                       | No       |
| sources                | List of sources to add to zone.                                    |                                                                           | No       |
| enable                 | Hides zone from Homekit                                            | true                                                                      | No       |

`sources` sources parameters:
| Fields                 | Description                                                        | Default                                                                   | Required |
|------------------------|--------------------------------------------------------------------|---------------------------------------------------------------------------|----------|
| name                   | Name of this source configured on the Russound Controller.         |                                                                           | Yes      |
| display_name           | Name that you want the source name to display                      | if blank it is name                                                       | No       |

# Troubleshooting
