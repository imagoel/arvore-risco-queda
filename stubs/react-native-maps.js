// Web stub for react-native-maps.
// This module is not available on web; the mapa.web.tsx fallback is used instead.
const React = require("react");
const { View } = require("react-native");

const MapView = () => React.createElement(View, null);
MapView.Animated = MapView;

const Marker = () => React.createElement(View, null);
const Callout = () => React.createElement(View, null);
const Polyline = () => React.createElement(View, null);
const Polygon = () => React.createElement(View, null);
const Circle = () => React.createElement(View, null);

module.exports = MapView;
module.exports.default = MapView;
module.exports.Marker = Marker;
module.exports.Callout = Callout;
module.exports.Polyline = Polyline;
module.exports.Polygon = Polygon;
module.exports.Circle = Circle;
module.exports.PROVIDER_GOOGLE = "google";
module.exports.PROVIDER_DEFAULT = null;
