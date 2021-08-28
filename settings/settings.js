/* eslint-disable no-unused-vars */
/* eslint-disable no-undef */

function displayLogs(lines) {
	$('#loglines').html(lines);
}

function updateLogs() {
	try {
		displayLogs('');
		const showLogs = $('#show_logs').prop('checked');
		const showErrors = $('#show_errors').prop('checked');
		Homey.api('GET', 'getlogs/', null, (err, result) => {
			if (!err) {
				let lines = '';
				result
					.reverse()
					.forEach((line) => {
						if (!showLogs) {
							if (line.includes('[log]')) return;
						}
						if (!showErrors) {
							if (line.includes('[err]')) return;
						}
						const logLine = line
							.replace(' [ManagerDrivers]', '')
							.replace(' [circle]', '');
							// .replace(/\[Device:(.*?)\]/, '[dev]')
							// .replace(/\[Driver:(.*?)\]/, '[$1]');
						lines += `${logLine}<br />`;
					});
				displayLogs(lines);
			} else {
				displayLogs(err);
			}
		});
	} catch (e) {
		displayLogs(e);
	}
}

function deleteLogs() {
	Homey.confirm(Homey.__('settings.tab4.deleteWarning'), 'warning', (error, result) => {
		if (result) {
			Homey.api('GET', 'deletelogs/', null, (err) => {
				if (err) {
					Homey.alert(err.message, 'error'); // [, String icon], Function callback )
				} else {
					Homey.alert(Homey.__('settings.tab4.deleted'), 'info');
					updateLogs();
				}
			});
		}
	});
}

function getSettings() {
	Homey.get('settings_pw2py', (err, storedData) => {
		if (!err && storedData) {
			$('#ip_pw2py').val(storedData.ip_pw2py);
			$('#port_pw2py').val(storedData.port_pw2py);
		}
	});
	Homey.get('settings', (err, storedData) => {
		if (!err && storedData) {
			$('#ip_mqtt').val(storedData.ip_mqtt);
			$('#port_mqtt').val(storedData.port_mqtt);
			$('#tls_mqtt').prop('checked', storedData.tls_mqtt);
			$('#username_mqtt').val(storedData.username_mqtt);
			$('#password_mqtt').val(storedData.password_mqtt);
		}
	});
}

function fillPw2pyURL() {
	if ($('#ip_pw2py').val() === '') {
		$('#ip_pw2py').val($('#ip_mqtt').val());
	}
}

function test() {
	saveData = {
		ip_mqtt: $('#ip_mqtt').val(),
		port_mqtt: $('#port_mqtt').val(),
		tls_mqtt: $('#tls_mqtt').prop('checked'),
		username_mqtt: $('#username_mqtt').val(),
		password_mqtt: $('#password_mqtt').val(),
	};
	Homey.api('POST', '/validate', saveData, (err, result) => {
		if (err) {
			return Homey.alert(err, 'error');
		}
		return Homey.alert(Homey.__('settings.tab2.correctSettings'), 'info');
	});
}

function savePw2py() {
	saveData = {
		ip_pw2py: $('#ip_pw2py').val(),
		port_pw2py: $('#port_pw2py').val(),
	};
	Homey.set('settings_pw2py', saveData, (err) => {
		if (err) {
			return Homey.alert(err, 'error');
		}
		return Homey.alert(Homey.__('settings.tab3.settingsSaved'), 'info');
	});
}

function saveMqtt() {
	saveData = {
		ip_mqtt: $('#ip_mqtt').val(),
		port_mqtt: $('#port_mqtt').val(),
		tls_mqtt: $('#tls_mqtt').prop('checked'),
		username_mqtt: $('#username_mqtt').val(),
		password_mqtt: $('#password_mqtt').val(),
	};
	Homey.set('settings', saveData, (err) => {
		if (err) {
			return Homey.alert(err, 'error');
		}
		return Homey.alert(Homey.__('settings.tab2.settingsSaved'), 'info');
	});
}

function openUrl(path) {
	const url = `http://${$('#ip_pw2py').val()}:${$('#port_pw2py').val()}${path}`;
	Homey.openURL(url);
}

function showTab(tab) {
	getSettings();
	if (tab === 3) { fillPw2pyURL(); }
	if (tab === 4) { updateLogs(); }
	$('.tab').removeClass('tab-active');
	$('.tab').addClass('tab-inactive');
	$(`#tabb${tab}`).removeClass('tab-inactive');
	$(`#tabb${tab}`).addClass('active');
	$('.panel').hide();
	$(`#tab${tab}`).show();
}

function onHomeyReady(homeyReady) {
	Homey = homeyReady;
	showTab(1);
	Homey.ready();
}
