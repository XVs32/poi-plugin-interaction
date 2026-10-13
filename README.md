# poi-plugin-api-forwarder

Forwards KanColle API responses and map resource URLs to kcauto's loopback
webhook. It also provides a loopback-only interaction service for kcauto's
`poi` mode.

The interaction service listens on `127.0.0.1:38591` by default and supports
game-view capture, mouse click/hover/scroll/drag, refresh, and POI quest data. Both
ports can be changed from the plugin settings.
