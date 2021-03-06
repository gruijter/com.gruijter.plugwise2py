# Plugwise-2-py #

Homey app to connect plugwise circles via [Plugwise-2-py]. This tool, developed
by [Seven Watt], can be used as an alternative for Plugwise Source. It runs on
all devices that support python, such as your NAS or a raspberry pi.

### Homey functionality ###
Device Card in browser and on mobile app:
* Switch on or off
* See real-time power usage (Watts, 8 seconds average)
* See total power meter of circle (kWh)

Insights:
* Switched on or off
* Power usage (W, production is negative Watts)
* Power meter (kWh)

Trigger Flow Cards:
* Switched on or off
* Power usage change
* Power meter change

Condition Flow Cards:
* Switched on or off

Action Flow Cards:
* Switch on or off
* Toggle on or off


### Setting up the PW2PY server ###
A manual for setting it up on a rpi is provided on [Plugwise-2-py].

To make it work properly with Homey you must do some base settings within PW2PY:
* Enable 10-seconds monitoring: this should be enabled
* Enable logging form Circle internal metering buffers: this should be enabled
* Log interval: I advise to set this to 60 minutes
* Schedules: can be used to switch a circle to powersaving mode automatically
* Always on: enable this for circles that must not be switchable from Homey
* Production: enable this for circles that measure production (e.g. solar panel)

### Setting up Homey ###
After setting up PW2PY you can configure Homey to connect to it. Go to the app
settings screen and enter the IP address of the PW2PY-MQTT server that you are
using.
Circles can then be added through the Devices tab of Homey. After pairing a
circle you can set the polling interval per circle in the device settings
(minimum 10 seconds).

##### Donate: #####
If you like the app you can show your appreciation by posting it in the [forum].
If you really like it you can buy me a beer, or coffee, or whatever you like :)

[![Paypal donate][pp-donate-image]][pp-donate-link]

===============================================================================

Version changelog: [changelog.txt]

[plugwise-2-py]: https://github.com/SevenW/Plugwise-2-py
[Seven Watt]: https://github.com/SevenW
[forum]: https://forum.athom.com/discussion/1998
[pp-donate-link]: https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=VLB7J3MQLVT2G
[pp-donate-image]: https://www.paypalobjects.com/en_US/i/btn/btn_donate_SM.gif
[changelog.txt]: https://github.com/gruijter/com.gruijter.plugwise2py/blob/master/changelog.txt
