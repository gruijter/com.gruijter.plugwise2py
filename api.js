//api.js needs to exist, otherwise frontend-backend communication fails....

module.exports = [        // fake method, not used

  {
    // validate account for use with settings page
    description: 'Validate settings',
    method: 'GET',
    path:	'/validate',
    requires_authorization: true,
    role: 'owner',
    fn: function (callback, args) {
      var service = args.query;
      Homey.log("api validation entered");
      Homey.log(args);
      Homey.log(service);

      Homey.app.send(service, service.toTest, service.testMessage, function (err, result){
      	//Homey.log(err, result);
        callback (err, result);
      });
    }
  }


]
