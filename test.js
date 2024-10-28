//import { RussoundError, CommandError, UncachedVariableError, UnsupportedFeatureError, UnsupportedRussoundVersionError } from './exceptions';
import { RussoundTcpConnectionHandler }  from './connection.js';
import { RussoundClient } from './rio.js';
//import { CallbackType } from './models.js';


function onStateChange(client, callbackType) {
    console.log(`Callback Type: ${callbackType} ${client.isConnected()}`);
    //console.log(client);
    console.log("Sources", client.sources);
    console.log("Zones", client.controllers[1].zones);

}

async function main() {
    const connection = new RussoundTcpConnectionHandler('192.168.1.250', 9621)
    const client = new RussoundClient(connection)

    await client.registerStateUpdateCallbacks(onStateChange);
    await client.connect();

    for (const [s_id, source] of Object.entries(client.sources)) {
        console.log(`Found source ${s_id} - ${source.name}`);
    }

    for (const [c_id, controller] of Object.entries(client.controllers)) {
        console.log(`Found controller ${c_id} - ${controller.macAddress}`);
        for (const [z_id, zone] of Object.entries(controller.zones)) {
            console.log(`Found zone ${z_id} - ${zone.name}`);
        }
    }
    //console.log("State", client.state);

    // // Play media using the unit's front controls or Russound app
    await new Promise(resolve => setTimeout(resolve, 30000));
    await client.disconnect();
}

main().catch(console.error);

