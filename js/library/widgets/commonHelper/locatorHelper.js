﻿/*global define,dojo,dojoConfig:true,alert,esri,Modernizr,appGlobals */
/*jslint browser:true,sloppy:true,nomen:true,unparam:true,plusplus:true,indent:4 */
/** @license
 | Copyright 2013 Esri
 |
 | Licensed under the Apache License, Version 2.0 (the "License");
 | you may not use this file except in compliance with the License.
 | You may obtain a copy of the License at
 |
 |    http://www.apache.org/licenses/LICENSE-2.0
 |
 | Unless required by applicable law or agreed to in writing, software
 | distributed under the License is distributed on an "AS IS" BASIS,
 | WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 | See the License for the specific language governing permissions and
 | limitations under the License.
 */
//============================================================================================================================//
define([
    "dojo/_base/declare",
    "dojo/dom-construct",
    "dojo/_base/lang",
    "dojo/on",
    "dojo/_base/array",
    "dojo/query",
    "esri/tasks/query",
    "dojo/promise/all",
    "esri/tasks/QueryTask",
    "esri/graphic",
    "dijit/_WidgetBase",
    "dojo/i18n!application/js/library/nls/localizedStrings",
    "dojo/topic",
    "esri/tasks/BufferParameters",
    "dojo/_base/Color",
    "esri/tasks/GeometryService",
    "esri/symbols/SimpleLineSymbol",
    "esri/symbols/SimpleFillSymbol"

], function (declare, domConstruct, lang, on, array, query, Query, all, QueryTask, Graphic, _WidgetBase, sharedNls, topic, BufferParameters, Color, GeometryService, SimpleLineSymbol, SimpleFillSymbol) {
    // ========================================================================================================================//

    return declare([_WidgetBase], {
        sharedNls: sharedNls,                                      // Variable for shared NLS

        /**
        * careate buffer around pushpin
        * @param {object} mapPoint Contains the map point on map
        * @param {string} widgetName Contains the name of the functionality from where buffer is created.
        * @memberOf widgets/commonHelper/locatorHelper
        */
        createBuffer: function (mapPoint, widgetName) {
            var params, geometryService;
            this.carouselContainer.removeAllPod();
            this.carouselContainer.addPod(this.carouselPodData);
            this.removeBuffer();
            geometryService = new GeometryService(appGlobals.configData.GeometryService);
            // checking the map point or map point is having geometry and if config data has buffer distance.
            if ((mapPoint || mapPoint.geometry) && appGlobals.configData.BufferDistance) {
                params = new BufferParameters();
                params.distances = [appGlobals.configData.BufferDistance];
                params.unit = GeometryService.UNIT_STATUTE_MILE;
                params.bufferSpatialReference = this.map.spatialReference;
                params.outSpatialReference = this.map.spatialReference;
                // checking the geometry
                if (mapPoint.geometry) {
                    params.geometries = [mapPoint.geometry];
                } else {
                    params.geometries = [mapPoint];
                }
                // creating buffer and calling show buffer function.
                geometryService.buffer(params, lang.hitch(this, function (geometries) {
                    this.showBuffer(geometries, mapPoint, widgetName);
                }));
            }
        },

        /**
        * show buffer on map
        * @param {object} geometries of mapPoint
        * @param {object} mapPoint Contains the map point
        * @memberOf widgets/commonHelper/locatorHelper
        */
        showBuffer: function (geometries, mapPoint, widgetName) {
            var bufferSymbol;
            // checking the geolocation variable in the case of share app.
            if (!appGlobals.shareOptions.sharedGeolocation) {
                this._clearBuffer();
            }
            bufferSymbol = new SimpleFillSymbol(SimpleFillSymbol.STYLE_SOLID, new SimpleLineSymbol(SimpleLineSymbol.STYLE_SOLID, new Color([parseInt(appGlobals.configData.BufferSymbology.LineSymbolColor.split(",")[0], 10), parseInt(appGlobals.configData.BufferSymbology.LineSymbolColor.split(",")[1], 10), parseInt(appGlobals.configData.BufferSymbology.FillSymbolColor.split(",")[2], 10), parseFloat(appGlobals.configData.BufferSymbology.LineSymbolTransparency.split(",")[0], 10)]), 2),
                        new Color([parseInt(appGlobals.configData.BufferSymbology.FillSymbolColor.split(",")[0], 10), parseInt(appGlobals.configData.BufferSymbology.FillSymbolColor.split(",")[1], 10), parseInt(appGlobals.configData.BufferSymbology.LineSymbolColor.split(",")[2], 10), parseFloat(appGlobals.configData.BufferSymbology.FillSymbolTransparency.split(",")[0], 10)]));
            // Adding graphic on map
            this._addGraphic(this.map.getLayer("tempBufferLayer"), bufferSymbol, geometries[0]);
            topic.publish("showProgressIndicator");
            // Querying for layer to find features.
            this._queryLayer(geometries[0], mapPoint, widgetName);
        },

        /**
        * clear buffer from map
        * @memberOf widgets/commonHelper/locatorHelper
        */
        _clearBuffer: function () {
            this.map.getLayer("tempBufferLayer").clear();
            topic.publish("hideInfoWindow");
            this.isInfowindowHide = true;
        },

        /**
        * add graphic layer on map of buffer and set expand
        * @param {object} layer Contains feature layer
        * @param {object} symbol Contains graphic
        * @param {object}point Contains the map point
        * @memberOf widgets/commonHelper/locatorHelper
        */
        _addGraphic: function (layer, symbol, point) {
            var graphic;
            graphic = new Graphic(point, symbol);
            layer.add(graphic);
            // checking the extent changed variable in the case of shared app to maintain extent on map
            if (window.location.href.toString().split("$extentChanged=").length > 1) {
                // if extent change variable set to be true then set the extent other wise don't do any thing.
                if (this.isExtentSet) {
                    this.map.setExtent(point.getExtent().expand(1.6));
                }
            } else {
                // In normal scenario set extent when graphics is added.
                this.map.setExtent(point.getExtent().expand(1.6));
            }
        },

        /**
        * query layer URL
        * create an object of graphic
        * @param {object} geometry of graphic
        * @param {object} mapPoint Contains the map point
        * @param {object} widget name of the functionality from query layer is called.
        * @memberOf widgets/commonHelper/locatorHelper
        */
        _queryLayer: function (geometry, mapPoint, widget) {
            var layerobject, i, deferredArray = [], result = [], widgetName, featuresWithinBuffer = [],
                dist, featureSet = [], isDistanceFound, j, k, routeObject;
            // validate selectedLayerTitle for querying on each layer configured, for finding facility within the buffer.
            if (widget) {
                widgetName = widget;
            } else {
                widgetName = "unifiedSearch";
            }
            if (this.selectedLayerTitle) {
                // Looping each layer for query
                array.forEach(appGlobals.configData.SearchSettings, lang.hitch(this, function (SearchSettings) {
                    // Checking search display title for getting layer.
                    if (SearchSettings.SearchDisplayTitle === this.selectedLayerTitle) {
                        layerobject = SearchSettings;
                        // Query on layer for facility.
                        this._queryLayerForFacility(layerobject, widget, geometry, deferredArray, mapPoint, result);
                    }
                }));
            } else {
                // Looping on each layer for finding facility within the buffer
                for (i = 0; i < appGlobals.configData.SearchSettings.length; i++) {
                    layerobject = appGlobals.configData.SearchSettings[i];
                    this._queryLayerForFacility(layerobject, widget, geometry, deferredArray, mapPoint, result);
                }
                // Calling deferred list when all query is completed.
                all(deferredArray).then(lang.hitch(this, function (relatedRecords) {
                    // looping the result for getting records and pushing it in a variable for further query
                    for (j = 0; j < result.length; j++) {
                        if (result.length > 0) {
                            this.dateFieldArray = this.getDateField(result[j].records);
                            for (k = 0; k < result[j].records.features.length; k++) {
                                featuresWithinBuffer.push(result[j].records.features[k]);
                            }
                        }
                    }
                    // Looping final array for finding distance from start point and calculating route.
                    for (i = 0; i < featuresWithinBuffer.length; i++) {
                        // Checking the geometry
                        if (mapPoint.geometry) {
                            dist = this.getDistance(mapPoint.geometry, featuresWithinBuffer[i].geometry);
                            isDistanceFound = true;
                        }
                        try {
                            featureSet[i] = featuresWithinBuffer[i];
                            featuresWithinBuffer[i].distance = dist.toString();
                        } catch (err) {
                            alert(sharedNls.errorMessages.falseConfigParams);
                        }
                    }
                    // If distance is calculated from the start point
                    if (isDistanceFound) {
                        featureSet.sort(function (a, b) {
                            return parseFloat(a.distance) - parseFloat(b.distance);
                        });
                        // looping the result data for sorting data by distance
                        array.forEach(result, lang.hitch(this, function (resultSet) {
                            resultSet.records.features.sort(function (a, b) {
                                return parseFloat(a.distance) - parseFloat(b.distance);
                            });
                        }));
                        this.highlightFeature(featureSet[0].geometry);
                        // Changing date format for feature if date field is available.
                        routeObject = { "StartPoint": mapPoint, "EndPoint": featureSet, "Index": 0, "WidgetName": widgetName, "QueryURL": layerobject.QueryURL, "activityData": result };
                        //Calling route function to create route
                        this.showRoute(routeObject);
                    }
                    // Checking result array length, if it is 0 then show message and hide carousel container and remove graphics
                    if (result.length === 0) {
                        alert(sharedNls.errorMessages.facilityNotfound);
                        appGlobals.shareOptions.eventInfoWindowData = null;
                        appGlobals.shareOptions.infoRoutePoint = null;
                        this.removeRouteGraphichOfDirectionWidget();
                        this.removeHighlightedCircleGraphics();
                        if (widgetName !== "unifiedSearch") {
                            this.removeLocatorPushPin();
                        }
                        if (this.carouselContainer) {
                            this.carouselContainer.hideCarouselContainer();
                            this.carouselContainer._setLegendPositionDown();
                        }
                        topic.publish("hideProgressIndicator");
                    }
                }));
            }
        },

        /**
        * query layer for getting facilty
        * finding route from start point to the nearest feature
        * @param {object} layerobject contains the layer information
        * @param {object} widget contains name of the functionality from query is called.
        * @param {object} geometry contains the geometry
        * @param {object} deferredArray contains deferred array for further operation
        * @param {object}mapPoint Contains the map point
        * @param {object} result array to contain feature data
        * @memberOf widgets/commonHelper/locatorHelper
        */
        _queryLayerForFacility: function (layerobject, widget, geometry, deferredArray, mapPoint, result) {
            var queryTask, queryLayer, layerObject;
            // Checking the query url availability
            if (layerobject.QueryURL) {
                queryTask = new QueryTask(layerobject.QueryURL);
                queryLayer = new Query();
                queryLayer.outFields = ["*"];
                queryLayer.returnGeometry = true;
                // Checking the geometry
                if (geometry) {
                    queryLayer.geometry = geometry;
                }
                layerObject = {};
                // Pushing the query task in deferred array for further query
                deferredArray.push(queryTask.execute(queryLayer, lang.hitch(this, function (records) {
                    layerObject = { "queryURL": layerobject.QueryURL, "records": records };
                    // If feature is available the push data in result.
                    if (records.features.length > 0) {
                        result.push(layerObject);
                    }
                })));
            } else {
                topic.publish("hideProgressIndicator");
            }
        }
    });
});
