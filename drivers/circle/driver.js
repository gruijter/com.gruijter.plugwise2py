var util    = require('util');
var mqtt    = require('mqtt');
var client  =  mqtt.connect();                   //MQTT client object
var host;
var options;
var allCirclesState = {};     //latest state of all pw2py devices
var allCirclesEnergy = {};    //latest energy state of all pw2py devices
var devices = {};             //paired Homey devices copy in memory
var intervalId = {};          //polling intervalId


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
Homey.log(util.inspect(client));

function connectMqtt () {
  // connect to mqtt broker
  client.end();
  var storedData = Homey.manager('settings').get( 'settings' );
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
  //	Homey.log(JSON.parse(message.toString()));
    if (message.length>0) {               // won't crash but question is why empty?
      switch (topic.substr(0, 25)){
        case 'plugwise2py/state/circle/':
          var circleState = JSON.parse(message.toString());
          handleNewCircleState(circleState);
          break;
        case 'plugwise2py/state/energy/':
          var circleEnergy = JSON.parse(message.toString());
          handleNewEnergyState(circleEnergy);
          break;
      }
    }
  });

};

function checkCircleState (device_data, callback) {
    client.publish('plugwise2py/cmd/reqstate/'+device_data.id, JSON.stringify({"mac":"","cmd":"reqstate","val":"1"}));
    Homey.log("polling state of: "+device_data.id);
    callback();
};

function switchCircleOnoff (device_data, onoff, callback) {
  if (onoff){
    client.publish('plugwise2py/cmd/switch/'+device_data.id, JSON.stringify({"mac":"","cmd":"switch","val":"on"}));
    Homey.log("switching on: "+device_data.id+allCirclesState[device_data.id].name);
  } else {
   client.publish('plugwise2py/cmd/switch/'+device_data.id, JSON.stringify({"mac":"","cmd":"switch","val":"off"}));
   Homey.log("switching off: "+device_data.id+allCirclesState[device_data.id].name);
  };
    callback();
};


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
  var deviceList=[]; //all pw2py devices list used during pairing
	var circle;
	for (circle in circles) {
//		Homey.log(circle);
		var tmp_device = {
			name: circles[circle].name,
			data: {
					id: circles[circle].mac,
          pairingState: circles[circle],    //full circleState as found during pairing
          pairingEnergy: {"typ":"pwenergy","ts":0,"mac":circles[circle].mac,"power":0,"energy":0,"cum_energy":0,"interval":0}
			},
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
  devices[device_data.id].name=new_name;        //There is a problem here: need to fix it with device settings.....
}

// the `settings` method is called when the user has changed the device settings in Homey
module.exports.settings = function( device_data, newSettingsObj, oldSettingsObj, changedKeysArr, callback ) {
    // see settings
    callback(null, true); 	// always fire the callback, or the settings won't change!
}

function updateSettings (device_data) {
  settings = {
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
  module.exports.setSettings( device_data.homey_device, settings, function( err, settings ){
      // ... dunno what to do here, think nothing...
  })
}


module.exports.capabilities = {
  onoff: {
    get: function(device_data, callback) {
      var device = devices[device_data.id];
      var state = null;
      if (devices[device_data.id]!=undefined){
        state = (device.circleState.switch=='on')
      }
      callback(null, state);
    },
    set: function( device_data, onoff, callback ) {
      if (devices[device_data.id]!=undefined){
        var device = devices[device_data.id];
        switchCircleOnoff(device, onoff, function (){
          //reserved for callback
        })
        return callback( null, device.circleState.switch=='on' );
      }
    }
  },
  measure_power: {
    get: function(device_data, callback) {
      var device = devices[device_data.id];
      var state = null;
      if (devices[device_data.id]!=undefined){
        state = device.circleState.power8s
      }
      callback(null, state);
    }
  },
  meter_power: {
    get: function(device_data, callback) {
      var device = devices[device_data.id];
      var state = null;
      if (devices[device_data.id]!=undefined){
        state = device.circleEnergy.cum_energy/1000
      }
      callback(null, state);
    }
  }
};


//----initDevice: retrieve device settings, buildDevice and start polling it----
function initDevice( device_data ) {
  Homey.log("entering initDevice");
  var nameSetting = {name: device_data.name};
  module.exports.getSettings( device_data, function( err, settings ){
    if (err) {
      Homey.log("error retrieving device settings");
    } else {    // after settings received build the new device object
      Homey.log("retrieved settings are:");
      Homey.log(settings);
      if (settings==(' '||{}||undefined)) { settings=nameSetting };
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
    circleState     : device_data.pairingState,       // circleState from moment of pairing
    circleEnergy    : device_data.pairingEnergy       // circleEnergy from moment of pairing
  };
  Homey.log("init buildDevice is: " );
  Homey.log(devices[device_data.id] );
};

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
  };
};

function handleNewEnergyState(circleEnergy){
  //allCirclesEnergy[circleEnergy.mac]=circleEnergy;    //update allCirclesState
  if (devices[circleEnergy.mac]!=undefined){        //update only paired and initialised devices
    devices[circleEnergy.mac].circleEnergy = circleEnergy;
    Homey.log(circleEnergy);
    if (devices[circleEnergy.mac].circleState.production==true){
      circleEnergy.cum_energy=-circleEnergy.cum_energy;
    }
    module.exports.realtime( devices[circleEnergy.mac].homey_device, 'meter_power', circleEnergy.cum_energy/1000 );
    allCirclesEnergy[circleEnergy.mac]=circleEnergy;    //update allCirclesState
  };
}
