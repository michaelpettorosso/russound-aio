/**
 *  Russound RIO.js 
 *
 *  Author: michael@pettorosso.com
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except
 *  in compliance with the License. You may obtain a copy of the License at:
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software distributed under the License is distributed
 *  on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License
 *  for the specific language governing permissions and limitations under the License.
 *
 *  Based on python code from aiorussound
 * 
 *      https://pypi.org/project/aiorussound/
 *  
 *  Supported Commands:
 *   Zone On/Off state
 *   Source selected -1
 *   Volume level (0 - 50, 0 = 0 Displayed ... 50 = 100 Displayed)
 *   Bass level (0 = -10 ... 10 = Flat ... 20 = +10)
 *   Treble level (0 = -10 ... 10 = Flat ... 20 = +10)
 *   Loudness (0 = OFF, 1 = ON )
 *   Balance level (0 = More Left ... 10 = Center ... 20 = More Right)
 *   System On state (0 = All Zones Off, 1 = Any Zone is On)
 *   Shared Source (0 = Not Shared 1 = Shared with another Zone)
 *   Party Mode state (0 = OFF, 1 = ON, 2 = Master)*
 *   Do Not Disturb state (0 = OFF, 1 = ON )*
*/
// const connection = new RussoundTcpConnectionHandler('192.168.1.250', 9621)
// const client = new RussoundClient(connection)

// await client.registerStateUpdateCallbacks(onStateChange);
// await client.connect();

//function onStateChange(client, callbackType) {
//    console.log(`Callback Type: ${callbackType} ${client.isConnected()}`);
//    console.log("Sources", client.sources);
//    console.log("Zones", client.controllers[1].zones);
//}
// Importing necessary modules
import RussoundTcpConnectionHandler from './connection.js';
import RussoundClient from './rio.js';

module.exports = {
    RussoundTcpConnectionHandler,
    RussoundClient
};