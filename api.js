module.exports = {
	// retrieve logs
	async getLogs({ homey }) {
		const result = await homey.app.getLogs();
		return result;
	},
	// delete logs
	async deleteLogs({ homey }) {
		const result = await homey.app.deleteLogs();
		return result;
	},
	// validte MQTT server settings
	async validateSettings({ homey, body }) {
		const result = await homey.app.validateSettings(body);
		return result;
	},
};
