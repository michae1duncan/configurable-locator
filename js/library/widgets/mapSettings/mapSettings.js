﻿/*global define,dojo,dojoConfig,alert,esri,window,setTimeout,clearTimeout,appGlobals */
/*jslint browser:true,sloppy:true,nomen:true,unparam:true,plusplus:true,indent:4 */
/** @license
| Version 10.2
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
    "dojo/dom-style",
    "dojo/_base/lang",
    "esri/arcgis/utils",
    "dojo/_base/array",
    "dojo/dom",
    "dojo/query",
    "dojo/dom-class",
    "dijit/_WidgetBase",
    "dijit/_TemplatedMixin",
    "dijit/_WidgetsInTemplateMixin",
    "dojo/i18n!application/js/library/nls/localizedStrings",
    "esri/layers/GraphicsLayer",
    "widgets/baseMapGallery/baseMapGallery",
    "esri/layers/FeatureLayer",
    "widgets/legends/legends",
    "esri/geometry/Extent",
    "esri/geometry/Point",
    "esri/dijit/HomeButton",
    "dojo/Deferred",
    "dojo/promise/all",
    "widgets/infoWindow/infoWindow",
    "dojo/text!../infoWindow/templates/infoWindow.html",
    "widgets/commonHelper/infoWindowHelper",
    "dojo/topic",
    "dojo/on",
    "dijit/a11yclick",
    "dojo/domReady!"
], function (declare, domConstruct, domStyle, lang, esriUtils, array, dom, query, domClass, _WidgetBase, _TemplatedMixin, _WidgetsInTemplateMixin, sharedNls, GraphicsLayer, BaseMapGallery, FeatureLayer, Legends, GeometryExtent, Point, HomeButton, Deferred, all, InfoWindow, template, InfoWindowHelper, topic, on, a11yclick) {
    //========================================================================================================================//

    return declare([_WidgetBase, _TemplatedMixin, _WidgetsInTemplateMixin], {
        map: null,
        templateString: template,                                         // Variable for template string
        tempGraphicsLayerId: "esriGraphicsLayerMapSettings",              // Variable for graphic layer on map
        sharedNls: sharedNls,                                             // Variable for shared NLS
        stagedSearch: null,                                               // variable use for timer clear
        infoWindowPanel: null,                                            // variable for infowindow panel
        tempBufferLayerId: "tempBufferLayer",                             // variable for buffer(graphicLayer) on map
        highlightLayerId: "highlightLayerId",                             // variable for ripple(graphicLayer) on map
        routeLayerId: "routeLayerId",                                     // variable for route(graphicLayer) on map
        searchSettings: [],                                               // searchSettings array is use to store the activity and event layer
        operationalLayers: [],                                            // operationalLayers array stores the layers from webmap, in case of webmap configuration
        isInfowindowHide: false,                                          // variable for hide infowindow
        isExtentSet: false,                                               // variable for set the extent
        geoLocationGraphicsLayerID: "geoLocationGraphicsLayer",           // Geolocation graphics layer id
        locatorGraphicsLayerID: "esriGraphicsLayerMapSettings",           // Locator graphics layer id
        /**
        * initialize map object
        *
        * @class
        * @name widgets/mapSettings/mapSettings
        */
        postCreate: function () {
            var mapDeferred, infoWindowPoint, point;
            appGlobals.operationLayerSettings = [];
            //subscribing function to set the position of infowindow on map
            topic.subscribe("setInfoWindowOnMap", lang.hitch(this, function (infoTitle, screenPoint, infoPopupWidth, infoPopupHeight) {
                this._onSetInfoWindowPosition(infoTitle, screenPoint, infoPopupWidth, infoPopupHeight);
            }));
            //subscribing value for extent
            topic.subscribe("extentSetValue", lang.hitch(this, function (value) {
                this.isExtentSet = value;
            }));

            //subscribing function to hide infowindow.
            topic.subscribe("hideInfoWindow", lang.hitch(this, function () {
                //check whether "mapClickPoint" is in the share URL or not.
                if (window.location.href.toString().split("$mapClickPoint=").length > 1) {
                    if (this.isExtentSet) {
                        this.infoWindowPanel.hide();
                        this.infoWindowPanel.InfoShow = true;
                        appGlobals.shareOptions.mapClickedPoint = null;
                        this.isInfowindowHide = true;
                    }
                } else {
                    this.infoWindowPanel.hide();
                    this.infoWindowPanel.InfoShow = true;
                    appGlobals.shareOptions.mapClickedPoint = null;
                    this.isInfowindowHide = true;
                }
            }));
            //subscribing function for show infowindow on map
            topic.subscribe("showInfoWindowOnMap", lang.hitch(this, function (point) {
                this._showInfoWindowOnMap(point);
            }));
            topic.subscribe("extentFromPoint", lang.hitch(this, function (mapPoint) {
                this._extentFromPoint(mapPoint);
            }));
            /**
            * load map
            * @param {string} appGlobals.configData.BaseMapLayers Basemap settings specified in configuration file
            */
            appGlobals.shareOptions.selectedBasemapIndex = 0;
            if (appGlobals.configData.WebMapId && lang.trim(appGlobals.configData.WebMapId).length !== 0) {
                mapDeferred = esriUtils.createMap(appGlobals.configData.WebMapId, "esriCTParentDivContainer", {
                    mapOptions: {
                        slider: true
                    },
                    ignorePopups: true
                });
                mapDeferred.then(lang.hitch(this, function (response) {
                    this.map = response.map;
                    appGlobals.shareOptions.selectedBasemapIndex = null;
                    if (response.itemInfo.itemData.baseMap.baseMapLayers) {
                        this._setBasemapLayerId(response.itemInfo.itemData.baseMap.baseMapLayers);
                    }
                    topic.publish("filterRedundantBasemap", response.itemInfo);
                    this._generateRequiredKeyField(response.itemInfo.itemData.operationalLayers);
                    topic.publish("setMap", this.map);
                    //topic.publish("hideProgressIndicator");
                    this._mapOnLoad();
                    // function for getting web map data
                    this._fetchWebMapData(response);
                    // function for share in the case of address search from unified search
                    setTimeout(lang.hitch(this, function () {
                        if (window.location.toString().split("$address=").length > 1) {
                            topic.publish("addressSearch");
                        }
                        if (window.location.href.toString().split("$mapClickPoint=").length > 1 && window.location.href.toString().split("$infowindowDirection=").length <= 1) {
                            appGlobals.shareOptions.isInfoPopupShared = true;
                            infoWindowPoint = window.location.href.toString().split("$mapClickPoint=")[1].split("$")[0].split(",");
                            point = new Point(parseFloat(infoWindowPoint[0]), parseFloat(infoWindowPoint[1]), this.map.spatialReference);
                            this._showInfoWindowOnMap(point);
                        }
                        if (window.location.href.toString().split("$infowindowDirection=").length > 1) {
                            appGlobals.shareOptions.isInfoPopupShared = true;
                            infoWindowPoint = window.location.href.toString().split("$infowindowDirection=")[1].split("$")[0].split(",");
                            point = new Point(parseFloat(infoWindowPoint[0]), parseFloat(infoWindowPoint[1]), this.map.spatialReference);
                            this._showInfoWindowOnMap(point);
                        }
                    }), 3000);
                    this._mapEvents();
                    if (appGlobals.configData.ShowLegend) {
                        setTimeout(lang.hitch(this, function () {
                            this._createWebmapLegendLayerList(response.itemInfo.itemData.operationalLayers);
                        }), 3000);
                    }
                    this.infoWindowPanel = new InfoWindow({ infoWindowWidth: appGlobals.configData.InfoPopupWidth, infoWindowHeight: appGlobals.configData.infoPopupHeight, map: this.map });
                    this.infoWindowHelperObject = new InfoWindowHelper({ map: this.map });
                    topic.publish("setLayerId", this.geoLocationGraphicsLayerID, this.locatorGraphicsLayerID);
                }), function (err) {
                    domStyle.set(dom.byId("esriCTParentDivContainer"), "display", "none");
                    alert(err.message);
                });
            }
            appGlobals.shareOptions.isInfoPopupShared = false;
        },

        /**
        * creating webmap layer list
        * @param{object} layers contain the layer information
        * @memberOf widgets/mapSettings/mapSettings
        */
        _createWebmapLegendLayerList: function (layers) {
            var i, webMapLayers = [], webmapLayerList = {}, hasLayers = false;
            // looping for layer for getting layer object
            for (i = 0; i < layers.length; i++) {
                // checking for layer visibility
                if (layers[i].visibility) {
                    if (layers[i].layerDefinition && layers[i].layerDefinition.drawingInfo) {
                        webmapLayerList[layers[i].url] = layers[i];
                        hasLayers = true;
                    } else {
                        webMapLayers.push(layers[i]);
                    }
                }
            }
            this._addLayerLegendWebmap(webMapLayers, webmapLayerList, hasLayers);
        },

        /**
        * set default id for basemaps
        * @memberOf widgets/mapSettings/mapSettings
        */
        _setBasemapLayerId: function (baseMapLayers) {
            var i = 0, defaultId = "defaultBasemap";
            if (baseMapLayers.length === 1) {
                this._setBasemapId(baseMapLayers[0], defaultId);
            } else {
                for (i = 0; i < baseMapLayers.length; i++) {
                    this._setBasemapId(baseMapLayers[i], defaultId + i);
                }
            }
        },

        /**
        * set default id for each basemap of webmap
        * @memberOf widgets/mapSettings/mapSettings
        */
        _setBasemapId: function (basmap, defaultId) {
            var layerIndex;
            this.map.getLayer(basmap.id).id = defaultId;
            this.map._layers[defaultId] = this.map.getLayer(basmap.id);
            layerIndex = array.indexOf(this.map.layerIds, basmap.id);
            if (defaultId !== basmap.id) {
                delete this.map._layers[basmap.id];
            }
            this.map.layerIds[layerIndex] = defaultId;
        },

        /**
        * create operation layer object depending on the default visibility of layer and populate in an array
        * @param{object} layers contain the layer information
        * @param{object} layerTable contain the layer table information information
        * @memberOf widgets/mapSettings/mapSettings
        */
        _createWebmapOperationLayer: function (layer, layerTable) {
            var url, urlArray, lastIndex, i, j, operationLayer, searchSettings = this.searchSettings, commentLayerURL;
            urlArray = layer.url.split('/');
            lastIndex = urlArray[urlArray.length - 1];
            //create a temp service url
            if (isNaN(lastIndex) || lastIndex === "") {
                if (lastIndex === "") {
                    url = layer.url;
                } else {
                    url = layer.url + "/";
                }
            } else {
                url = layer.url.substring(0, layer.url.lastIndexOf("/") + 1);
            }
            if (layer.layerObject.geometryType === "esriGeometryPoint") {
                this.map.reorderLayer(layer.layerObject, array.indexOf(this.map.graphicsLayerIds, this.tempBufferLayerId));
            }
            //create an object of operation layer
            if (layer.layerObject.layerInfos) {
                //layer is added as dynamic layer in the webmap
                for (i = 0; i < layer.layerObject.layerInfos.length; i++) {
                    operationLayer = {};
                    //check the operation layer default visibility
                    if (layer.layerObject.layerInfos[i].defaultVisibility) {
                        //set the operation layer title
                        operationLayer.layerTitle = lang.trim(layer.title);
                        //set the operation layer ID
                        operationLayer.layerID = layer.layerObject.layerInfos[i].id;
                        //set the operation layer service URL
                        if (isNaN(lastIndex) || lastIndex === "") {
                            operationLayer.layerURL = url + layer.layerObject.layerInfos[i].id;
                        } else {
                            operationLayer.layerURL = url;
                        }
                        //set searchSetting for operation layer if available
                        for (j = 0; j < searchSettings.length; j++) {
                            if (lang.trim(layer.title) === searchSettings[j][0].Title && layer.layerObject.layerInfos[i].id === parseInt((searchSettings[j][0].QueryLayerId), 10)) {
                                searchSettings[j].QueryURL = operationLayer.layerURL;
                                searchSettings[j][0].QueryURL = operationLayer.layerURL;
                                commentLayerURL = this._getRelatedTableURL(layerTable);
                                if (searchSettings[j][0].CommentsSettings) {
                                    searchSettings[j][0].CommentsSettings.QueryURL = commentLayerURL;
                                    operationLayer.activitySearchSettings = searchSettings[j][0];
                                } else {
                                    operationLayer.eventSearchSettings = searchSettings[j][0];
                                }
                                break;
                            }
                        }
                        appGlobals.operationLayerSettings.push(operationLayer);
                    }
                }
            } else {
                //layer is added as feature layer in webmap
                operationLayer = {};
                //set the operation layer title
                operationLayer.layerTitle = lang.trim(layer.title);
                //set the operation layer ID
                operationLayer.layerID = layer.layerObject.layerId;
                //set the operation layer service URL
                operationLayer.layerURL = layer.url;
                //set searchSetting for operation layer if available
                for (j = 0; j < searchSettings.length; j++) {
                    if (lang.trim(layer.title) === searchSettings[j][0].Title && layer.layerObject.layerId === parseInt((searchSettings[j][0].QueryLayerId), 10)) {
                        searchSettings[j].QueryURL = layer.url;
                        searchSettings[j][0].QueryURL = layer.url;
                        commentLayerURL = this._getRelatedTableURL(layerTable);
                        if (searchSettings[j][0].CommentsSettings) {
                            searchSettings[j][0].CommentsSettings.QueryURL = commentLayerURL;
                            operationLayer.activitySearchSettings = searchSettings[j][0];
                        } else {
                            operationLayer.eventSearchSettings = searchSettings[j][0];
                        }
                        break;
                    }
                }
                appGlobals.operationLayerSettings.push(operationLayer);
            }
        },

        /**
        * store infoWindow fields in an array to display in infoWindow content
        * @param{object} layerInfo contain the layer information
        * @param{object} infoWindowData info window data
        * @memberOf widgets/mapSettings/mapSettings
        */
        _createWebMapInfoWindowData: function (layerInfo, infoWindowData) {
            var i, infoWindowHeaderField, field;
            //set infowWindow header field with title and attribute
            if (layerInfo.popupInfo.title.split("{").length > 1) {
                infoWindowHeaderField = lang.trim(layerInfo.popupInfo.title.split("{")[0]) + " ";
                for (i = 1; i < layerInfo.popupInfo.title.split("{").length; i++) {
                    infoWindowHeaderField += "${" + lang.trim(layerInfo.popupInfo.title.split("{")[i]);
                }
            } else {
                if (lang.trim(layerInfo.popupInfo.title) !== "") {
                    infoWindowHeaderField = lang.trim(layerInfo.popupInfo.title);
                } else {
                    infoWindowHeaderField = appGlobals.configData.ShowNullValueAs;
                }
            }
            infoWindowData.infoWindowHeader = infoWindowHeaderField;
            //populate infoWindow fieldname and display text
            infoWindowData.infoWindowfields = [];
            for (field in layerInfo.popupInfo.fieldInfos) {
                if (layerInfo.popupInfo.fieldInfos.hasOwnProperty(field)) {
                    if (layerInfo.popupInfo.fieldInfos[field].visible) {
                        infoWindowData.infoWindowfields.push({
                            "DisplayText": layerInfo.popupInfo.fieldInfos[field].label + ":",
                            "FieldName": "${" + layerInfo.popupInfo.fieldInfos[field].fieldName + "}",
                            "format": layerInfo.popupInfo.fieldInfos[field].format
                        });
                    }
                }
            }
        },

        /**
        * this function helps to fetch web map data from web map
        * @param{object} response contain the layer information
        * @memberOf widgets/mapSettings/mapSettings
        */
        _fetchWebMapData: function (response) {
            var j, k, webMapDetails, layerInfo, layerTable = [], defArr, layerURL;
            layerTable = response && response.itemInfo && response.itemInfo.itemData && response.itemInfo.itemData.tables ? response.itemInfo.itemData.tables : "";
            this.searchSettings.push(appGlobals.configData.ActivitySearchSettings);
            this.searchSettings.push(appGlobals.configData.EventSearchSettings);
            webMapDetails = response.itemInfo.itemData;
            appGlobals.configData.OperationalLayers = [];
            this.operationalLayers = webMapDetails.operationalLayers;
            //for (i = 0; i < webMapDetails.operationalLayers.length; i++) {
            array.forEach(webMapDetails.operationalLayers, lang.hitch(this, function (LayerData, i) {
                if (webMapDetails.operationalLayers[i].visibility) {
                    //create operation layers array
                    this._createWebmapOperationLayer(webMapDetails.operationalLayers[i], layerTable);
                    //set infowWindowData for each operation layer
                    if (webMapDetails.operationalLayers[i].layers) {
                        defArr = [];
                        //Fetching infopopup data in case the layers are added as dynamic layers in the webmap
                        for (j = 0; j < webMapDetails.operationalLayers[i].layers.length; j++) {
                            layerInfo = webMapDetails.operationalLayers[i].layers[j];
                            //check the operation layer before creating the infoWindow data
                            for (k = 0; k < appGlobals.operationLayerSettings.length; k++) {
                                if (appGlobals.operationLayerSettings[k].layerURL === webMapDetails.operationalLayers[i].url + "/" + layerInfo.id) {
                                    //set infoWindow content to operation layer
                                    appGlobals.operationLayerSettings[k].infoWindowData = {};
                                    layerURL = webMapDetails.operationalLayers[i].url + "/" + webMapDetails.operationalLayers[i].layers[j].id;
                                    defArr.push(this._loadFeatureLayer(layerURL, webMapDetails.operationalLayers[i].layers[j], k));
                                    break;
                                }
                            }
                            this._createWebMapInfoWindowData(layerInfo, appGlobals.operationLayerSettings[k].infoWindowData);
                        }
                        all(defArr).then(lang.hitch(this, function (results) {
                            array.forEach(results, lang.hitch(this, function (resultsData) {
                                array.forEach(appGlobals.operationLayerSettings, lang.hitch(this, function (LayerInfo) {
                                    if (resultsData) {
                                        if (LayerInfo.layerURL === resultsData.url) {
                                            LayerInfo.layerDetails = resultsData;
                                        }
                                    }
                                }));
                            }));
                        }));
                    } else if (webMapDetails.operationalLayers[i].popupInfo) {
                        //Fetching infopopup data in case the layers are added as feature layers in the webmap
                        layerInfo = webMapDetails.operationalLayers[i];
                        //check the operation layer before creating the infoWindow data
                        for (k = 0; k < appGlobals.operationLayerSettings.length; k++) {
                            if (appGlobals.operationLayerSettings[k].layerURL === webMapDetails.operationalLayers[i].url) {
                                //set infoWindow content to operation layer
                                appGlobals.operationLayerSettings[k].infoWindowData = {};
                                appGlobals.operationLayerSettings[k].layerDetails = webMapDetails.operationalLayers[i];
                                break;
                            }
                        }
                        this._createWebMapInfoWindowData(layerInfo, appGlobals.operationLayerSettings[k].infoWindowData);
                    }
                }
            }));
        },

        _loadFeatureLayer: function (layerURL, layerObject, k) {
            var fLayer, param = {}, def = new Deferred();
            fLayer = new FeatureLayer(layerURL);
            on(fLayer, "load", lang.hitch(this, function (evt) {
                param = layerObject;
                param.index = k;
                param.url = layerURL;
                param.layerObject = evt.layer;
                def.resolve(param);
            }));
            return def;
        },

        /**
        * map onclick event
        * @memberOf widgets/mapSettings/mapSettings
        */
        _mapEvents: function () {
            var point;
            this.own(on(this.map, a11yclick, lang.hitch(this, function (evt) {
                if (evt.graphic || evt.mapPoint) {
                    topic.publish("extentSetValue", true);
                    point = evt.mapPoint;
                    this._showInfoWindowOnMap(point);
                }
            })));
            this.map.on("extent-change", lang.hitch(this, function () {
                if (!this.infoWindowPanel.InfoShow) {
                    var infoPopupHeight, infoPopupWidth;
                    infoPopupHeight = appGlobals.configData.InfoPopupHeight;
                    infoPopupWidth = appGlobals.configData.InfoPopupWidth;
                    this._setInfoWindowHeightWidth(infoPopupWidth, infoPopupHeight);
                    topic.publish("setMapTipPosition", appGlobals.shareOptions.selectedMapPoint, this.map, this.infoWindowPanel);
                }
            }));
        },

        /**
        * Set info window height and width
        * @param{int} info popup width
        * @param{int} info popup Height
        * @memberOf widgets/mapSettings/mapSettings
        */
        _setInfoWindowHeightWidth: function (infoPopupWidth, infoPopupHeight) {
            this.infoWindowPanel.resize(infoPopupWidth, infoPopupHeight);
        },

        /**
        * initialize map object when map is loading
        * @memberOf widgets/mapSettings/mapSettings
        */
        _mapOnLoad: function () {
            var home, mapDefaultExtent, graphicsLayer, buffergraphicsLayer, extent, routegraphicsLayer, highlightfeature, imgSource, imgCustomLogo, mapLogoPostionDown;
            /**
            * set map extent to default extent
            * @param {string} Default extent of map
            */
            extent = this._getQueryString('extent');
            if (extent !== "") {
                mapDefaultExtent = extent.split(',');
                mapDefaultExtent = new GeometryExtent({ "xmin": parseFloat(mapDefaultExtent[0]), "ymin": parseFloat(mapDefaultExtent[1]), "xmax": parseFloat(mapDefaultExtent[2]), "ymax": parseFloat(mapDefaultExtent[3]), "spatialReference": { "wkid": this.map.spatialReference.wkid } });
                this.map.setExtent(mapDefaultExtent);
            }
            /**
            * load esri 'Home Button' widget
            */
            home = this._addHomeButton();
            domConstruct.place(home.domNode, query(".esriSimpleSliderIncrementButton")[0], "after");
            home.startup();

            // if ShowLegend is 'true' then set esriLogo position above the Legend
            if (appGlobals.configData.ShowLegend) {
                mapLogoPostionDown = query('.esriControlsBR')[0];
                domClass.add(mapLogoPostionDown, "esriCTDivMapPositionTop");
            }
            if (appGlobals.configData.CustomLogoUrl && lang.trim(appGlobals.configData.CustomLogoUrl).length !== 0) {
                if (appGlobals.configData.CustomLogoUrl.match("http:") || appGlobals.configData.CustomLogoUrl.match("https:")) {
                    imgSource = appGlobals.configData.CustomLogoUrl;
                } else {
                    imgSource = dojoConfig.baseURL + appGlobals.configData.CustomLogoUrl;
                }
                imgCustomLogo = domConstruct.create("img", { "src": imgSource, "class": "esriCTCustomMapLogo" }, dom.byId("esriCTParentDivContainer"));
                // if ShowLegend is 'true' then set customLogo position above the Legend
                if (appGlobals.configData.ShowLegend) {
                    domClass.add(imgCustomLogo, "esriCTCustomMapLogoBottom");
                }
            }
            buffergraphicsLayer = new GraphicsLayer();
            buffergraphicsLayer.id = this.tempBufferLayerId;
            this.map.addLayer(buffergraphicsLayer);
            graphicsLayer = new GraphicsLayer();
            graphicsLayer.id = this.tempGraphicsLayerId;
            this.map.addLayer(graphicsLayer);
            routegraphicsLayer = new GraphicsLayer();
            routegraphicsLayer.id = this.routeLayerId;
            highlightfeature = new GraphicsLayer();
            highlightfeature.id = this.highlightLayerId;
            this.map.addLayer(highlightfeature);
            this.map.addLayer(routegraphicsLayer);
            if (appGlobals.configData.BaseMapLayers.length > 1) {
                this._showBaseMapGallery();
            }
            graphicsLayer.on("graphic-add", lang.hitch(this, function (feature) {
                topic.publish("doBufferHandler", feature);
            }));
        },

        /**
        * set infowindow position
        * @param{string} infoTitle info window title
        * @param{object} screenPoint contain screen Point
        * @param{object} infoPopupHeight contain the info Popup Height
        * @param{object} infoPopupWidth contain the info Popup Width
        * @memberOf widgets/mapSettings/mapSettings
        */
        _onSetInfoWindowPosition: function (infoTitle, screenPoint, infoPopupHeight, infoPopupWidth) {
            this.infoWindowPanel.resize(infoPopupHeight, infoPopupWidth);
            this.infoWindowPanel.hide();
            this.infoWindowPanel.show(screenPoint);
            appGlobals.shareOptions.infoWindowIsShowing = true;
            this.infoWindowPanel.setTitle(infoTitle);
        },

        /**
        * show infoWindow on map
        * @param {Map point} mapPoint
        * @memberOf widgets/mapSettings/mapSettings
        */
        _showInfoWindowOnMap: function (mapPoint) {
            appGlobals.shareOptions.mapClickedPoint = mapPoint;
            var index, onMapFeaturArray = [], featureArray = [];
            this.counter = 0;
            for (index = 0; index < appGlobals.operationLayerSettings.length; index++) {

                this._executeQueryTask(index, mapPoint, onMapFeaturArray);
            }
            all(onMapFeaturArray).then(lang.hitch(this, function (result) {
                var j, i;
                if (result) {
                    for (j = 0; j < result.length; j++) {
                        if (result[j]) {
                            if (result[j].features.length > 0) {
                                for (i = 0; i < result[j].features.length; i++) {
                                    if (appGlobals.operationLayerSettings[j].infoWindowData) {
                                        topic.publish("hideCarouselContainer");
                                        featureArray.push({
                                            attr: result[j].features[i],
                                            fields: result[j].fields,
                                            layerId: appGlobals.operationLayerSettings[j].layerID,
                                            layerTitle: appGlobals.operationLayerSettings[j].layerTitle,
                                            layerDetails: appGlobals.operationLayerSettings[j].layerDetails
                                        });
                                    }
                                }
                            }
                        }
                    }
                    this._fetchQueryResults(featureArray);
                }
            }), function (err) {
                alert(err.message);
            });
        },

        /**
        * execute query for the layer
        * @param {number} index of feature layer
        * @param {object} mapPoint
        * @param {array} onMapFeaturArray Contains array of feature layer URL
        * @memberOf widgets/mapSettings/mapSettings
        */
        _executeQueryTask: function (index, mapPoint, onMapFeaturArray) {
            var queryTask, queryLayer, isLayerVisible, currentDate = new Date().getTime().toString() + index, deferred;
            queryTask = new esri.tasks.QueryTask(appGlobals.operationLayerSettings[index].layerURL);
            queryLayer = new esri.tasks.Query();
            isLayerVisible = this._checkLayerVisibility(appGlobals.operationLayerSettings[index].layerURL);
            if (isLayerVisible) {
                queryLayer.where = currentDate + "=" + currentDate;
            } else {
                queryLayer.where = "1=2";
            }
            queryLayer.outSpatialReference = this.map.spatialReference;
            queryLayer.returnGeometry = true;
            queryLayer.geometry = this._extentFromPoint(mapPoint);
            queryLayer.outFields = ["*"];
            deferred = new Deferred();
            queryTask.execute(queryLayer, lang.hitch(this, function (results) {
                deferred.resolve(results);
            }), function (err) {
                alert(err.message);
                deferred.resolve();
            });
            onMapFeaturArray.push(deferred);
        },

        /**
        * Description
        * @method _checkLayerVisibility
        * @param {} layerUrl
        * @return returnVal
        */
        _checkLayerVisibility: function (layerUrl) {
            var layer, lastChar, mapLayerUrl, layerUrlIndex = layerUrl.split('/'),
                returnVal = false;
            layerUrlIndex = layerUrlIndex[layerUrlIndex.length - 1];
            for (layer in this.map._layers) {
                if (this.map._layers.hasOwnProperty(layer)) {
                    if (this.map._layers[layer].url === layerUrl) {
                        if (this.map._layers[layer].visibleAtMapScale) {
                            returnVal = true;
                            break;
                        }
                    } else if (this.map._layers[layer].visibleLayers) {
                        lastChar = this.map._layers[layer].url[this.map._layers[layer].url.length - 1];
                        if (lastChar === "/") {
                            mapLayerUrl = this.map._layers[layer].url + layerUrlIndex;
                        } else {
                            mapLayerUrl = this.map._layers[layer].url + "/" + layerUrlIndex;
                        }
                        if (mapLayerUrl === layerUrl) {
                            if (this.map._layers[layer].visibleLayers.indexOf(parseInt(layerUrlIndex, 10)) !== -1) {
                                if (this.map._layers[layer].visibleAtMapScale) {
                                    if (this.map._layers[layer].dynamicLayerInfos) {
                                        if (this.map.__LOD.scale < this.map._layers[layer].dynamicLayerInfos[parseInt(layerUrlIndex, 10)].minScale) {
                                            returnVal = true;
                                            break;
                                        }
                                    } else {
                                        returnVal = true;
                                        break;
                                    }
                                } else {
                                    returnVal = true;
                                    break;
                                }
                            }
                        }
                    }
                }
            }
            return returnVal;
        },

        /**
        * set extent from mappoint
        * @param {object} mapPoint
        * @memberOf widgets/mapSettings/mapSettings
        */
        _extentFromPoint: function (point) {
            var tolerance, screenPoint, pnt1, pnt2, mapPoint1, mapPoint2, geometryPointData;
            tolerance = 20;
            screenPoint = this.map.toScreen(point);
            pnt1 = new esri.geometry.Point(screenPoint.x - tolerance, screenPoint.y + tolerance);
            pnt2 = new esri.geometry.Point(screenPoint.x + tolerance, screenPoint.y - tolerance);
            mapPoint1 = this.map.toMap(pnt1);
            mapPoint2 = this.map.toMap(pnt2);
            //set the screen point xmin, ymin, xmax, ymax
            appGlobals.shareOptions.screenPoint = mapPoint1.x + "," + mapPoint1.y + "," + mapPoint2.x + "," + mapPoint2.y;
            if (window.location.href.toString().split("$mapClickPoint=").length > 1) {
                if (!this.isExtentSet) {
                    geometryPointData = new esri.geometry.Extent(parseFloat(window.location.href.toString().split("$mapClickPoint=")[1].split(",")[2]), parseFloat(window.location.href.toString().split("$mapClickPoint=")[1].split(",")[3]), parseFloat(window.location.href.toString().split("$mapClickPoint=")[1].split(",")[4]), parseFloat(window.location.href.toString().split("$mapClickPoint=")[1].split(",")[5].split("$")[0]), this.map.spatialReference);
                } else {
                    geometryPointData = new esri.geometry.Extent(mapPoint1.x, mapPoint1.y, mapPoint2.x, mapPoint2.y, this.map.spatialReference);
                }
            } else {
                geometryPointData = new esri.geometry.Extent(mapPoint1.x, mapPoint1.y, mapPoint2.x, mapPoint2.y, this.map.spatialReference);
            }
            return geometryPointData;
        },

        /**
        * fetch infowindow data from query task result
        * @param {array} featureArray Contains features array on map
        * @memberOf widgets/mapSettings/mapSettings
        */
        _fetchQueryResults: function (featureArray) {
            var point, infoWindowParameter;
            topic.publish("showProgressIndicator");
            if (featureArray.length > 0) {
                this.count = 0;
                if (featureArray[this.count].attr.geometry.type === "polygon") {
                    point = featureArray[this.count].attr.geometry.getCentroid();
                } else if (featureArray[this.count].attr.geometry.type === "polyline") {
                    point = featureArray[this.count].attr.geometry.getPoint(0, 0);
                } else {
                    point = featureArray[0].attr.geometry;
                }

                infoWindowParameter = {
                    "mapPoint": point,
                    "attribute": featureArray[0].attr.attributes,
                    "layerId": featureArray[0].layerId,
                    "layerTitle": featureArray[0].layerTitle,
                    "featureArray": featureArray,
                    "featureSet": featureArray[0].attr,
                    "IndexNumber": 1
                };
                topic.publish("hideProgressIndicator");
                this.infoWindowHelperObject._createInfoWindowContent(infoWindowParameter);
            } else {
                topic.publish("hideProgressIndicator");
            }
        },

        utcTimestampFromMs: function (utcMilliseconds) {
            return this.localToUtc(new Date(utcMilliseconds));
        },

        /**
        * convert the local time to UTC
        * @param {object} localTimestamp contains Local time
        * @returns Date
        * @memberOf widgets/mapSettings/mapSettings
        */
        localToUtc: function (localTimestamp) {
            return new Date(localTimestamp.getTime());
        },

        /**
        * get the string of service URL using query operation
        * @param {number} key for service URL
        * @memberOf widgets/mapSettings/mapSettings
        */
        _getQueryString: function (key) {
            var extentValue = "", regex, qs;
            regex = new RegExp("[\\?&]" + key + "=([^&#]*)");
            qs = regex.exec(window.location.href);
            if (qs && qs.length > 0) {
                extentValue = qs[1];
            }
            return extentValue;
        },

        /**
        * generate required Key Fields which are required in functions
        * @param {Layer} operationalLayers contains service layer URL
        * @memberOf widgets/mapSettings/mapSettings
        */
        _generateRequiredKeyField: function (operationalLayers) {
            var searchSettings, i, str, layerTitle, layerId, index, eventIndex, eventSearchSettings;
            array.forEach(appGlobals.configData.EventSearchSettings, lang.hitch(this, function (settings, eventSettingIndex) {
                appGlobals.configData.EventSearchSettings[eventSettingIndex].ObjectID = "";
                appGlobals.configData.EventSearchSettings[eventSettingIndex].DateField = [];
            }));

            // Looping for getting object id from activity search.
            array.forEach(appGlobals.configData.ActivitySearchSettings, lang.hitch(this, function (settings, activitySettingIndex) {
                appGlobals.configData.ActivitySearchSettings[activitySettingIndex].ObjectID = "";
                appGlobals.configData.ActivitySearchSettings[activitySettingIndex].DateField = [];
            }));

            searchSettings = appGlobals.configData.ActivitySearchSettings;
            eventSearchSettings = appGlobals.configData.EventSearchSettings;
            // loop for the operational layer
            for (i = 0; i < operationalLayers.length; i++) {
                // check if webMapId is not configured then layer is  directly load from operational layer
                if (appGlobals.configData.WebMapId && lang.trim(appGlobals.configData.WebMapId).length !== 0) {
                    str = operationalLayers[i].url.split('/');
                    layerTitle = operationalLayers[i].title;
                    layerId = str[str.length - 1];
                    // loop for searchSetting fetch each layer
                    for (index = 0; index < searchSettings.length; index++) {
                        // check Title and QueryLayerId both are having in activitySearchSetting
                        if (searchSettings[index].Title && searchSettings[index].QueryLayerId) {
                            // check  layer Title and layer QueryLayerId from activitySearchSetting
                            if (layerTitle === searchSettings[index].Title && layerId === searchSettings[index].QueryLayerId) {
                                searchSettings[index].ObjectID = operationalLayers[i].layerObject.objectIdField;
                                searchSettings[index].DateField = this.getDateField(operationalLayers[i].layerObject.fields);
                            }
                        }
                    }
                    // loop for event layers to fetch the each layer information
                    for (eventIndex = 0; eventIndex < eventSearchSettings.length; eventIndex++) {
                        // check Title and QueryLayerId both are having in  eventSearchSettings
                        if (eventSearchSettings[eventIndex].Title && eventSearchSettings[eventIndex].QueryLayerId) {
                            // check  layer Title and layer QueryLayerId from eventSearchSettings
                            if (layerTitle === eventSearchSettings[eventIndex].Title && layerId === eventSearchSettings[eventIndex].QueryLayerId) {
                                eventSearchSettings[eventIndex].ObjectID = operationalLayers[i].layerObject.objectIdField;
                                eventSearchSettings[eventIndex].DateField = this.getDateField(operationalLayers[i].layerObject.fields);
                            }
                        }
                    }
                }
            }
        },

        /**
        * load esri 'Home Button' widget which sets map extent to default extent
        * @return {object} Home button widget
        * @memberOf widgets/mapSettings/mapSettings
        */
        _addHomeButton: function () {
            var home;
            home = new HomeButton({
                map: this.map
            }, domConstruct.create("div", {}, null));
            return home;
        },

        /**
        * Initialize the object of baseMapGallery
        * @return {object} baseMapGallery widget
        * @memberOf widgets/mapSettings/mapSettings
        */
        _showBaseMapGallery: function () {
            var baseMapGallery = new BaseMapGallery({
                map: this.map
            }, domConstruct.create("div", {}, null));
            return baseMapGallery;
        },

        /**
        * initialize the object of legend box
        * @return {legendObject} returns the legend Object
        * @memberOf widgets/mapSettings/mapSettings
        */
        _addLegendBox: function () {
            var mmap = this.map;
            this.legendObject = new Legends({
                map: mmap,
                isExtentBasedLegend: false
            }, domConstruct.create("div", {}, null));
            return this.legendObject;
        },

        /**
        * add legend for the web map
        * @memberOf widgets/mapSettings/mapSettings
        */
        _addLayerLegendWebmap: function (webMapLayers, webmapLayerList, hasLayers) {
            var mapServerArray = [], i, j, legendObject, layer;
            // loop for webmap layer
            for (j = 0; j < webMapLayers.length; j++) {
                if (webMapLayers[j].layerObject) {
                    if (webMapLayers[j].layers) {
                        for (i = 0; i < webMapLayers[j].layers.length; i++) {
                            layer = webMapLayers[j].url + "/" + webMapLayers[j].layers[i].id;
                            if (webMapLayers[j].layers[i].layerDefinition && webMapLayers[j].layers[i].layerDefinition.drawingInfo) {
                                hasLayers = true;
                                webmapLayerList[layer] = webMapLayers[j].layers[i];
                            } else {
                                mapServerArray.push({ "url": layer, "title": webMapLayers[j].layers[i].name });
                            }
                        }
                    } else if (webMapLayers[j].layerObject.layerInfos) {
                        for (i = 0; i < webMapLayers[j].layerObject.layerInfos.length; i++) {
                            layer = webMapLayers[j].url + "/" + webMapLayers[j].layerObject.layerInfos[i].id;
                            mapServerArray.push({ "url": layer, "title": webMapLayers[j].layerObject.layerInfos[i].name });
                        }
                    } else {
                        mapServerArray.push({ "url": webMapLayers[j].url, "title": webMapLayers[j].title });
                    }
                } else {
                    mapServerArray.push({ "url": webMapLayers[j].url, "title": webMapLayers[j].title });
                }
            }
            if (!hasLayers) {
                webmapLayerList = null;
            }
            legendObject = this._addLegendBox();
            legendObject.startup(mapServerArray, webmapLayerList, this.map.extent);
            topic.publish("setMaxLegendLength");
        },

        /**
        * return current map instance
        * @return {object} Current map instance
        * @memberOf widgets/mapSettings/mapSettings
        */
        getMapInstance: function () {
            return this.map;
        },

        /**
        * Get object id from the layer
        * @param {object} response contain the layer information
        * @return {objectId} returns the objectId
        * @memberOf widgets/mapSettings/mapSettings
        */
        getObjectId: function (response) {
            var objectId, j;
            // loop through the layer fields to fetch field of the type 'esriFieldTypeOID'
            for (j = 0; j < response.length; j++) {
                if (response[j].type === "esriFieldTypeOID") {
                    objectId = response[j].name;
                    break;
                }
            }
            return objectId;
        },

        /**
        * Get date field from layer
        * @param {object} response contain the layer information
        * @return {dateFieldArray} returns the date field array
        * @memberOf widgets/mapSettings/mapSettings
        */
        getDateField: function (response) {
            var j, dateFieldArray = [], dateField;
            // loop through the layer fields and store fields of the type 'esriFieldTypeDate' in an array
            for (j = 0; j < response.length; j++) {
                if (response[j].type === "esriFieldTypeDate") {
                    dateField = response[j].name;
                    dateFieldArray.push(dateField);
                }
            }
            return dateFieldArray;
        },

        /**
        * Get related table url from webmap data
        * @param {object} layerTable contains the table data of webmap
        * @param {string} title contains the title of the layer
        * @return {string} commentLayerURL contains url of the comment layer
        * @memberOf widgets/mapSettings/mapSettings
        */
        _getRelatedTableURL: function (layerTable) {
            var commentLayerURL = "", title, splitedURL, activitySettingsQueryLayerID, i, layerId;
            title = appGlobals.configData.ActivitySearchSettings[0].CommentsSettings.Title;
            activitySettingsQueryLayerID = appGlobals.configData.ActivitySearchSettings[0].CommentsSettings.QueryLayerId;
            // Checking for layer table if present
            if (layerTable) {
                // Looping for layer table for getting url from data
                for (i = 0; i < layerTable.length; i++) {
                    // Fetching layer table url and splited it for querylayerID
                    splitedURL = layerTable[i].url.split('/');
                    layerId = splitedURL[splitedURL.length - 1];
                    // Checking for  layer title and table's title for fetching comment layer's url
                    if (layerTable[i].title === title && layerId === activitySettingsQueryLayerID) {
                        commentLayerURL = layerTable[i].url;
                        break;
                    }
                }
            }
            return commentLayerURL;
        }
    });
});
