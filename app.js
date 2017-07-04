'use strict';

// const util = require('util');
const mqtt = require('mqtt');
let testClient;    // MQTT client object

module.exports.init = init;

function init() {
	Homey.log('app init started');
}


// -----------------------app settings page backend-----------------------------

// Fired when a setting has been changed
Homey.manager('settings').on('set', (changedKey) => {
	// Homey.log(changedKey);
	if (changedKey === 'testing') {		// save button is pressed, testing can start
		Homey.log('driver.js received test event from frontend');
		const testBroker = Homey.manager('settings').get('testing');
		Homey.log(testBroker);

		const testHost = `mqtt://${testBroker.ip_mqtt}:${testBroker.port_mqtt}`;
		const testOptions =
			{
				// port: testBroker.port_mqtt,
				clientId: `Homey_${Math.random().toString(16).substr(2, 8)}`,
				username: testBroker.username_mqtt,
				password: testBroker.password_mqtt,
			};
		testClient = mqtt.connect(testHost, testOptions);
		testClient.on('connect', (connack) => {
			Homey.log(connack);
//			Homey.log(util.inspect(client));
			Homey.log('connection with broker successful');
			Homey.log(`client is connected? : ${testClient.connected}`);
			Homey.manager('api').realtime('testing_ready', { error: null, result: 'connected to MQTT broker' }); // send result back to settings html
		});

		testClient.on('error', (error) => {
			Homey.log(error);
			Homey.log('connection with broker not successful');
			Homey.log(`client is connected? : ${testClient.connected}`);
			Homey.manager('api').realtime('testing_ready', { error: true, result: 'connection with broker not successful' }); // send result back to settings html
		});

		setTimeout(() => {
			if (!testClient.connected) {
				Homey.log('connection with broker not successful');
				Homey.manager('api').realtime('testing_ready', { error: true, result: 'connection timeout' }); // send result back to settings html
			} else { testClient.end(); }
		}, 5000);

	} else { Homey.log('settings have changed'); }
});
