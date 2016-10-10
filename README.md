# Plugwise-2-py #

Homey app to connect plugwise circles via [Plugwise-2-py]. This tool, developed
by [Seven Watt], can be used as an alternative for Plugwise Source. It runs on
all devices that support python, such as your NAS or a raspberry pi.

### Setting it up: ###
It can be a bit of a challenge to setup the [Plugwise-2-py] tool up if you are
not really into python or linux. A manual for setting it up on a rpi is provided
on [Plugwise-2-py].

After setting up Plugwise-2-py you can configure Homey to connect to it. some of
the base settings should however always be done within Plugwise-2-py, such as:
* Enable 10-seconds monitoring: this should be enabled
* Enable logging form Circle internal metering buffers: this should be enabled
* Log interval: I advise to set this to 60 minutes
* Schedules: can be used to switch a circle to powersaving mode automatically
* Always on: enable this for circles that must not be switchable from Homey
* Production: enable this for circles that measure production (e.g. solar panel)

Circles are added through the Devices tab of Homey.

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


##### Donate: #####

If you like the app you can show your appreciation by posting it in the [forum],
and if you really like it you can donate. Feature requests can also be placed on
the forum.

[![Paypal donate][pp-donate-image]][pp-donate-link]


===============================================================================

Version changelog
```
v0.0.2  2016.10.10 fix Unexpected end of input' crash
v0.0.1  2016.09.30 Initial release
```

[plugwise-2-py]: https://github.com/SevenW/Plugwise-2-py
[Seven Watt]: https://github.com/SevenW
[forum]: https://forum.athom.com/discussion/1998
[pp-donate-link]: https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=VLB7J3MQLVT2G
[pp-donate-image]: https://www.paypalobjects.com/en_US/i/btn/btn_donate_SM.gif
