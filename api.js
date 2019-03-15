const Homey = require('homey');

module.exports = [
	{
		description: 'Validate settings',
		method: 'POST',
		path: '/validate',
		requires_authorization: true,
		role: 'owner',
		fn: function fn(args, callback) {
			Homey.app.validateSettings(args.body)
				.then((result) => {
					callback(null, result);
				})
				.catch((error) => {
					callback(error.message, null);
				});
		},
	},
	{
		description: 'Show loglines',
		method: 'GET',
		path: '/getlogs/',
		requires_authorization: true,
		role: 'owner',
		fn: function fn(args, callback) {
			const result = Homey.app.getLogs();
			callback(null, result);
		},
	},
	{
		description: 'Delete logs',
		method: 'GET',
		path: '/deletelogs/',
		requires_authorization: true,
		role: 'owner',
		fn: function fn(args, callback) {
			const result = Homey.app.deleteLogs();
			callback(null, result);
		},
	},
];
