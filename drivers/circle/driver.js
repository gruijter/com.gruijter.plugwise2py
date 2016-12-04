"use strict";

const util    = require('util');
const mqtt    = require('mqtt');
let client  =  mqtt.connect();                   //MQTT client object
let host;
let options;
let allCirclesState = {};     //latest state of all pw2py devices
let allCirclesEnergy = {};    //latest energy state of all pw2py devices
let devices = {};             //paired Homey devices copy in memory
let intervalId = {};          //polling intervalId


//----------------------Initializing devices-----------------------------
// the `init` method is called when your driver is loaded after start or reboot
module.exports.init = function( devices_data, callback ) {
  connectMqtt();
  devices_data.forEach(function(device_data){
    initDevice( device_data );
  });
  callback();
}

//-----------Plugwise2py MQTT broker communication----------------
//Homey.log(util.inspect(client));

function connectMqtt () {
  // connect to mqtt broker
  client.end();
  let storedData = Homey.manager('settings').get( 'settings' );
  //Homey.log('got data: ', storedData);
  if (storedData != (null || undefined)) {
    host = 'mqtt://'+storedData.ip_mqtt+':'+storedData.port_mqtt;
    options =
      {
        //port    			: storedData.port_mqtt,
        clientId			: 'Homey_'+ Math.random().toString(16).substr(2, 8),
        username			: storedData.username_mqtt,
        password			: storedData.password_mqtt
      };
    client  = new mqtt.connect(host, options);
  };

  //subscribe to plugwise2py MQTT broker - circle state
  client.on('connect', function (connack) {
    Homey.log(connack);
    client.subscribe('plugwise2py/state/circle/#');
  	Homey.log("subscribing to plugwise2py/state/circle/#");
    client.subscribe('plugwise2py/state/energy/#');
    Homey.log("subscribing to plugwise2py/state/energy/#");
  });

  //handle incoming messages
  client.on('message', function (topic, message) {
    // message is Buffer
  	Homey.log("message received from topic: "+topic);
//  	Homey.log(JSON.parse(message.toString()));
    if (message.length>0) {               // won't crash but question is why empty?
      switch (topic.substr(0, 25)){
        case 'plugwise2py/state/circle/':
          let circleState = JSON.parse(message.toString());
          handleNewCircleState(circleState);
          break;
        case 'plugwise2py/state/energy/':
          let circleEnergy = JSON.parse(message.toString());
          handleNewEnergyState(circleEnergy);
          break;
      }
    }
  });

}

function checkCircleState (device_data, callback) {
    client.publish('plugwise2py/cmd/reqstate/'+device_data.id, JSON.stringify({"mac":"","cmd":"reqstate","val":"1"}));
//    Homey.log("polling state of: "+device_data.id);
    callback();
}

function switchCircleOnoff (device_data, onoff, callback) {
  if (onoff){
    client.publish('plugwise2py/cmd/switch/'+device_data.id, JSON.stringify({"mac":"","cmd":"switch","val":"on"}));
    Homey.log("switching on: "+device_data.id+allCirclesState[device_data.id].name);
  } else {
   client.publish('plugwise2py/cmd/switch/'+device_data.id, JSON.stringify({"mac":"","cmd":"switch","val":"off"}));
   Homey.log("switching off: "+device_data.id+allCirclesState[device_data.id].name);
  };
  callback();
}


//----------------------Pairing and deleting-------------------------------

// the `pair` method is called when a user start pairing
module.exports.pair = function( socket ) {
  socket.on('list_devices', function( data, callback ){
    Homey.log("listing of devices started");
    makeDeviceList(allCirclesState, function( deviceList ){
      Homey.log(deviceList);
      callback( null, deviceList );
    });
  });
  socket.on('disconnect', function(){
    Homey.log("User aborted pairing, or pairing is finished");
  })
}

// the `added` method is called is when pairing is done and a device has been added
module.exports.added = function( device_data, callback ) {
  Homey.log("Device has been added: "+util.inspect(device_data));
  initDevice( device_data );
  callback( null, true );
}

// the `delete` method is called when a device has been deleted by a user
module.exports.deleted = function( device_data, callback ) {
  Homey.log('Deleting ' + device_data.id);
  clearInterval(intervalId[device_data.id]); //end polling of device for readings
  setTimeout(function() {         //wait for running poll to end
    delete devices[device_data.id];
  },12000);
  callback( null, true );
}

// make pairing list of all circels posted by pw2py
function makeDeviceList(circles, callback) {
  Homey.log('entered makeDeviceList');
  let deviceList=[]; //all pw2py devices list used during pairing
	let circle;
	for (circle in circles) {
//		Homey.log(circle);
		let tmp_device = {
			name: circles[circle].name,
			data: { id: circles[circle].mac	},
      settings: {name: circles[circle].name},       //pw2py name of device as found during pairing
      capabilities:  ["onoff", "measure_power", "meter_power"]
		}
		deviceList.push(tmp_device);
	};
//  Homey.log(deviceList);
  callback(deviceList);
}


// -------------Settings and Capabilities handling------------------------------

// Fired when an app setting has changed
Homey.manager('settings').on( 'set', function(changedKey){
	//Homey.log(changedKey);
	if (changedKey == 'settings'){		// save button is pressed, reconnect must be initiated
    Homey.log("Settings save button is pressed, reconnect is started");
    connectMqtt();
  }
});

// the `renamed` method is called when the user has renamed the device in Homey
module.exports.renamed = function( device_data, new_name ) {
  devices[device_data.id].name=new_name;
}

// the `settings` method is called when the user has changed the device settings in Homey
module.exports.settings = function( device_data, newSettingsObj, oldSettingsObj, changedKeysArr, callback ) {
    // see settings
    callback(null, true); 	// always fire the callback, or the settings won't change!
}

function updateSettings (device_data) {
  if (device_data.circleState!=undefined){
    let settingsData = {
      name        : device_data.name,                                           // Homey name of device
      mac         : device_data.circleState.mac,                                // mac of circle in pw2py // allCirclesState[device_data.id].mac
      type        : device_data.circleState.type,                               // 'circle' or 'circle+'
      production  : device_data.circleState.production.toString(),              // true or false // allCirclesState[device_data.id].production
      pwName      : device_data.circleState.name,                               // name of circle in pw2py // allCirclesState[device_data.id].name
      location    : device_data.circleState.location,                           // location of circle in pw2py // allCirclesState[device_data.id].location
      online      : device_data.circleState.online.toString(),                  // true or false // dunno exactly what makes the condition true
      lastseen    : new Date(device_data.circleState.lastseen*1000).toString(), // timestamp when circle was last seen by circle+ maybe? or by pw2py?
      switchable  : (!device_data.circleState.readonly).toString(),             // true or false // allCirclesState[device_data.id].readonly
      schedule    : device_data.circleState.schedule.toString(),                // 'on' or 'off' // allCirclesState[device_data.id].schedule
      schedname   : device_data.circleState.schedname                           // name of schedule to use // allCirclesState[device_data.id].schedname
    };
    module.exports.setSettings( device_data.homey_device, settingsData, function( err, settings ){
        // ... dunno what to do here, think nothing...
    })
  }
}


module.exports.capabilities = {
  onoff: {
    get: function(device_data, callback) {
      if (devices[device_data.id]!=undefined){
        let state = (devices[device_data.id].circleState.switch=='on');
        return callback(null,state);
      }
      callback();
    },
    set: function( device_data, onoff, callback ) {
      if (devices[device_data.id]!=undefined){
        switchCircleOnoff(devices[device_data.id], onoff, function (){
          //reserved for callback
        })
        return callback( null, devices[device_data.id].circleState.switch=='on' );
      }
      callback();
    }
  },
  measure_power: {
    get: function(device_data, callback) {
      if (devices[device_data.id]!=undefined){
        if (devices[device_data.id].circleState.power8s != null){
          let state = devices[device_data.id].circleState.power8s
          return callback(null,state);
        }
      }
      callback();
    }
  },
  meter_power: {
    get: function(device_data, callback) {
      if (devices[device_data.id]!=undefined){
        if (devices[device_data.id].circleEnergy.cum_energy != null){
          state = devices[device_data.id].circleEnergy.cum_energy/1000;
          return callback(null,state);
        }
      }
      callback();
    }
  }
}


//----initDevice: retrieve device settings, buildDevice and start polling it----
function initDevice( device_data ) {
  Homey.log("entering initDevice");
  module.exports.getSettings( device_data, function( err, settings ){
    if (err) {
      Homey.log("error retrieving device settings");
    } else {    // after settings received build the new device object
      Homey.log("retrieved settings are:");
      Homey.log(settings);
      buildDevice(device_data, settings);
      startPolling(device_data);
    }
  });
}

//------------build device during init and add to Homey devicelist--------------
function buildDevice (device_data, settings){
  devices[ device_data.id ] = {
    id              : device_data.id,                 // is equal to the circle mac
    name            : settings.name,                  // name of the Homey device
    homey_device    : device_data,                    // device_data object from moment of pairing
    circleState : {                       // or device_data.pairingState   // circleState from moment of pairing
      mac             : null,             // e.g. '000D6F000037A836'  //mac of circle in pw2py // allCirclesState[device_data.id].mac
      type            : null,             // 'circle' or 'circle+'
      name            : null,             // e.g. 'çar'               // name of circle in pw2py // allCirclesState[device_data.id].name
      location        : null,             // e.g. '1st floor'         // location of circle in pw2py // allCirclesState[device_data.id].location
      online          : null,             // true or false            // dunno exactly what makes the condition true
      lastseen        : null,             // e.g. 1475524537          // timestamp when circle was last seen by circle+ maybe? or by pw2py?
      monitor         : null,             // true or false            // Autonomous messages are published when monitoring = true and savelog = true
      savelog         : null,             // true or false            // Autonomous messages are published when monitoring = true and savelog = true
      interval        : null,             // e.g. 60                  // circle buffer power measure integration interval in minutes?
      readonly        : null,             // true or false            // allCirclesState[device_data.id].readonly
      schedule        : null,             // 'on' or 'off'            // allCirclesState[device_data.id].schedule
      schedname       : null,             // e.g. 'sched. 1'          // name of schedule to use // allCirclesState[device_data.id].schedname
      switch          : 'off',            // 'on' or 'off'            // allCirclesState[device_data.id].switch
      switchreq       : null,             // 'on' or 'off'            // dunno what this is...
      requid          : null,             // e.g. 'internal'          // dunno what this is... MQTT clientId maybe?
      reverse_pol     : null,             // true or false            // reverses the sign if true
      production      : null,             // true or false            // allCirclesState[device_data.id].production
      powerts         : null,             // e.g. 1475524537          // timestamp of power measurement?
      power1s         : null,             // e.g. 0                   //1s power measure (W) // allCirclesState[device_data.id].power1s
      power8s         : null,             // e.g. 0                   //8s power measure (W) // allCirclesState[device_data.id].power8s
      power1h         : null              // e.g. 0                   //1h power measure (Wh) // allCirclesState[device_data.id].power1h
    },
    circleEnergy: {                       // or device_data.pairingEnergy    // circleEnergy from moment of pairing
      typ             : null,             // "pwenergy"
      ts              : null,             // e.g. 1474194240          // timestamp when energy was read
      mac             : null,             // e.g. '000D6F000037A836'  // mac of circle in pw2py
      power           : null,             // e.g. 185.6051            // dunno what this is... 8s power measure maybe?
      energy          : null,             // e.g. 6.1868              // energy (wH) over last interval?
      cum_energy      : null,             // e.g. 521930.4033         // energy (wH) since start of reading by pw2py?
      interval        : null              // e.g. 60                  // circle buffer power measure integration interval in minutes?
    }
  }
  Homey.log("init buildDevice is: " );
  Homey.log(devices[device_data.id] );
}

//-------------start polling device for readings every 20 seconds--------------
function startPolling(device_data){
  intervalId[device_data.id] = setInterval(function () {
    if (client==undefined){connectMqtt()}
    else {
      if (!client.connected){
        module.exports.setUnavailable( device_data, "MQTT broker not connected" );
        connectMqtt();
      } else {
        checkCircleState(device_data, function(response){
            //reserved for callback
          });
        }
      }
  }, 20000);
}

//-------------------Update device_data in memory and log for insights-----------------
function handleNewCircleState(circleState){
  allCirclesState[circleState.mac]=circleState;    //update allCirclesState
  //Homey.log(circleState);
  if (devices[circleState.mac]!=undefined){        //update only paired and initialised devices
    devices[circleState.mac].circleState = circleState;
    module.exports.realtime( devices[circleState.mac].homey_device, 'measure_power', circleState.power8s );
    module.exports.realtime( devices[circleState.mac].homey_device, 'onoff', circleState.switch=='on' );
    updateSettings(devices[circleState.mac]);
    if (circleState.online==true) {
      module.exports.setAvailable( devices[circleState.mac].homey_device )
    } else {
      module.exports.setUnavailable( devices[circleState.mac].homey_device, "Offline" );
    }
  }
}

function handleNewEnergyState(circleEnergy){
  if (devices[circleEnergy.mac]!=undefined){        //update only paired and initialised devices
    devices[circleEnergy.mac].circleEnergy = circleEnergy;
    if (devices[circleEnergy.mac].circleState.production==true){
      circleEnergy.cum_energy=-circleEnergy.cum_energy;
    };
    module.exports.realtime( devices[circleEnergy.mac].homey_device, 'meter_power', circleEnergy.cum_energy/1000 );
    allCirclesEnergy[circleEnergy.mac]=circleEnergy;    //update allCirclesState
  }
}
