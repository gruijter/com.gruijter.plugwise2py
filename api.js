const Homey = require('homey');

module.exports = [
	{
		description:	'Validate settings',
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
];
