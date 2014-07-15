﻿/*global define,dojo,dojoConfig,alert,esri,window,setTimeout,clearTimeout */
/*jslint sloppy:true,nomen:true,plusplus:true,unparam:true */  //
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
    "dojo/dom-attr",
    "dojo/query",
    "dojo/dom-class",
    "dijit/_WidgetBase",
    "dijit/_TemplatedMixin",
    "dijit/_WidgetsInTemplateMixin",
    "dojo/i18n!application/js/library/nls/localizedStrings",
    "esri/map",
    "esri/layers/ImageParameters",
    "esri/layers/FeatureLayer",
    "esri/layers/GraphicsLayer",
    "esri/symbols/SimpleLineSymbol",
    "esri/renderers/SimpleRenderer",
    "dojo/_base/Color",
    "widgets/baseMapGallery/baseMapGallery",
    "widgets/legends/legends",
    "esri/geometry/Extent",
    "esri/dijit/HomeButton",
    "dojo/Deferred",
    "dojo/DeferredList",
    "widgets/infoWindow/infoWindow",
    "dojo/text!../infoWindow/templates/infoWindow.html",
    "dojo/topic",
    "esri/layers/ArcGISDynamicMapServiceLayer",
    "dojo/domReady!"
], function (declare, domConstruct, domStyle, lang, esriUtils, array, dom, domAttr, query, domClass, _WidgetBase, _TemplatedMixin, _WidgetsInTemplateMixin, sharedNls, esriMap, ImageParameters, FeatureLayer, GraphicsLayer, SimpleLineSymbol, SimpleRenderer, Color, BaseMapGallery, Legends, GeometryExtent, HomeButton, Deferred, DeferredList, InfoWindow, template, topic, ArcGISDynamicMapServiceLayer) {

    //========================================================================================================================//

    return declare([_WidgetBase, _TemplatedMixin, _WidgetsInTemplateMixin], {
        map: null,
        templateString: template,
        tempGraphicsLayerId: "esriGraphicsLayerMapSettings",
        sharedNls: sharedNls,
        stagedSearch: null,
        infoWindowPanel: null,
        tempBufferLayerId: "tempBufferLayer",
        highlightLayerId: "highlightLayerId",
        routeLayerId: "routeLayerId",
        featureLayerId: "index",

        /**
        * initialize map object
        *
        * @class
        * @name widgets/mapSettings/mapSettings
        */
        postCreate: function () {
            var mapDeferred, layer;
            topic.subscribe("setInfoWindowOnMap", lang.hitch(this, function (infoTitle, divInfoDetailsTab, screenPoint, infoPopupWidth, infoPopupHeight) {

                this._onSetInfoWindowPosition(infoTitle, divInfoDetailsTab, screenPoint, infoPopupWidth, infoPopupHeight);
            }));
            /**
            * load map
            * @param {string} dojo.configData.BaseMapLayers Basemap settings specified in configuration file
            */
            dojo.selectedBasemapIndex = 0;
            this.infoWindowPanel = new InfoWindow({ infoWindowWidth: dojo.configData.InfoPopupWidth, infoWindowHeight: dojo.configData.infoPopupHeight });
            if (dojo.configData.WebMapId && lang.trim(dojo.configData.WebMapId).length !== 0) {
                mapDeferred = esriUtils.createMap(dojo.configData.WebMapId, "esriCTParentDivContainer", {
                    mapOptions: {
                        slider: true
                    },
                    ignorePopups: true
                });
                mapDeferred.then(lang.hitch(this, function (response) {
                    this.map = response.map;
                    dojo.selectedBasemapIndex = 0;
                    if (response.itemInfo.itemData.baseMap.baseMapLayers && response.itemInfo.itemData.baseMap.baseMapLayers[0].id) {
                        if (response.itemInfo.itemData.baseMap.baseMapLayers[0].id !== "defaultBasemap") {
                            this.map.getLayer(response.itemInfo.itemData.baseMap.baseMapLayers[0].id).id = "defaultBasemap";
                            this.map._layers.defaultBasemap = this.map.getLayer(response.itemInfo.itemData.baseMap.baseMapLayers[0].id);
                            delete this.map._layers[response.itemInfo.itemData.baseMap.baseMapLayers[0].id];
                            this.map.layerIds[0] = "defaultBasemap";
                        }
                    }
                    this._fetchWebMapData(response);
                    topic.publish("setMap", this.map);
                    topic.publish("hideProgressIndicator");
                    this._generateLayerURL(response.itemInfo.itemData.operationalLayers);
                    this._addLayerLegend();
                    this._mapOnLoad();
                    this.stagedSearch = setTimeout(lang.hitch(this, function () {
                        this._addLayerLegendWebmap(response);
                    }), 3000);
                }));
            } else {
                this._generateLayerURL(dojo.configData.OperationalLayers);
                this.map = esriMap("esriCTParentDivContainer", {});
                if (dojo.configData.BaseMapLayers[0].length > 1) {
                    array.forEach(dojo.configData.BaseMapLayers[0], lang.hitch(this, function (basemapLayer, index) {
                        layer = new esri.layers.ArcGISTiledMapServiceLayer(basemapLayer.MapURL, { id: "defaultBasemap" + index, visible: true });
                        this.map.addLayer(layer);
                    }));
                } else {
                    layer = new esri.layers.ArcGISTiledMapServiceLayer(dojo.configData.BaseMapLayers[0].MapURL, { id: "defaultBasemap", visible: true });
                    this.map.addLayer(layer);
                }
                this.map.on("load", lang.hitch(this, function () {

                    this._mapOnLoad();
                }));
            }
        },

        _fetchWebMapData: function (response) {
            var searchSettings, i, j, k, l, p, str, field, index, webMapDetails, operationalLayers, serviceTitle, operationalLayerId, lastIndex, layerInfo;
            searchSettings = dojo.configData.SearchSettings;
            webMapDetails = response.itemInfo.itemData;
            dojo.configData.OperationalLayers = [];
            operationalLayers = dojo.configData.OperationalLayers;
            serviceTitle = [];
            p = 0;
            for (i = 0; i < webMapDetails.operationalLayers.length; i++) {
                operationalLayerId = lang.trim(webMapDetails.operationalLayers[i].title);
                str = webMapDetails.operationalLayers[i].url.split('/');
                lastIndex = str[str.length - 1];
                if (isNaN(lastIndex) || lastIndex === "") {
                    if (lastIndex === "") {
                        serviceTitle[operationalLayerId] = webMapDetails.operationalLayers[i].url;
                    } else {
                        serviceTitle[operationalLayerId] = webMapDetails.operationalLayers[i].url + "/";
                    }
                } else {
                    serviceTitle[operationalLayerId] = webMapDetails.operationalLayers[i].url.substring(0, webMapDetails.operationalLayers[i].url.lastIndexOf("/") + 1);
                }
            }

            for (index = 0; index < searchSettings.length; index++) {
                if (searchSettings[index].Title && searchSettings[index].QueryLayerId && serviceTitle[searchSettings[index].Title]) {
                    searchSettings[index].QueryURL = serviceTitle[searchSettings[index].Title] + searchSettings[index].QueryLayerId;
                    for (j = 0; j < webMapDetails.operationalLayers.length; j++) {
                        if (webMapDetails.operationalLayers[j].title && serviceTitle[webMapDetails.operationalLayers[j].title] && (webMapDetails.operationalLayers[j].title === searchSettings[index].Title)) {
                            if (webMapDetails.operationalLayers[j].layers) {
                                //Fetching infopopup data in case the layers are added as dynamic layers in the webmap
                                for (k = 0; k < webMapDetails.operationalLayers[j].layers.length; k++) {
                                    layerInfo = webMapDetails.operationalLayers[j].layers[k];
                                    if (Number(searchSettings[index].QueryLayerId) === layerInfo.id) {
                                        if (webMapDetails.operationalLayers[j].layers[k].popupInfo) {
                                            operationalLayers[p] = {};
                                            operationalLayers[p].ServiceURL = webMapDetails.operationalLayers[j].url + "/" + webMapDetails.operationalLayers[j].layers[k].id;
                                            p++;
                                            if (layerInfo.popupInfo.title.split("{").length > 1) {
                                                searchSettings[index].InfoWindowHeaderField = lang.trim(layerInfo.popupInfo.title.split("{")[0]) + " ";
                                                for (l = 1; l < layerInfo.popupInfo.title.split("{").length; l++) {
                                                    searchSettings[index].InfoWindowHeaderField += "${" + lang.trim(layerInfo.popupInfo.title.split("{")[l]);
                                                }
                                            } else {
                                                if (lang.trim(layerInfo.popupInfo.title) !== "") {
                                                    searchSettings[index].InfoWindowHeaderField = lang.trim(layerInfo.popupInfo.title);
                                                } else {
                                                    searchSettings[index].InfoWindowHeaderField = sharedNls.showNullValue;
                                                }
                                            }
                                            searchSettings[index].InfoWindowData = [];
                                            for (field in layerInfo.popupInfo.fieldInfos) {
                                                if (layerInfo.popupInfo.fieldInfos.hasOwnProperty(field)) {
                                                    if (layerInfo.popupInfo.fieldInfos[field].visible) {
                                                        searchSettings[index].InfoWindowData.push({
                                                            "DisplayText": layerInfo.popupInfo.fieldInfos[field].label + ":",
                                                            "FieldName": "${" + layerInfo.popupInfo.fieldInfos[field].fieldName + "}"
                                                        });
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            } else if (webMapDetails.operationalLayers[j].popupInfo) {
                                //Fetching infopopup data in case the layers are added as feature layers in the webmap
                                operationalLayers[p] = {};
                                operationalLayers[p].ServiceURL = webMapDetails.operationalLayers[j].url;
                                p++;
                                if (webMapDetails.operationalLayers[j].popupInfo.title.split("{").length > 1) {
                                    searchSettings[index].InfoWindowHeaderField = lang.trim(webMapDetails.operationalLayers[j].popupInfo.title.split("{")[0]);
                                    for (l = 1; l < webMapDetails.operationalLayers[j].popupInfo.title.split("{").length; l++) {
                                        searchSettings[index].InfoWindowHeaderField += " ${" + lang.trim(webMapDetails.operationalLayers[j].popupInfo.title.split("{")[l]);
                                    }
                                } else {
                                    if (lang.trim(webMapDetails.operationalLayers[j].popupInfo.title) !== "") {
                                        searchSettings[index].InfoWindowHeaderField = lang.trim(webMapDetails.operationalLayers[j].popupInfo.title);
                                    } else {
                                        searchSettings[index].InfoWindowHeaderField = sharedNls.showNullValue;
                                    }
                                }
                                searchSettings[index].InfoWindowData = [];
                                for (field in webMapDetails.operationalLayers[j].popupInfo.fieldInfos) {
                                    if (webMapDetails.operationalLayers[j].popupInfo.fieldInfos.hasOwnProperty(field)) {
                                        if (webMapDetails.operationalLayers[j].popupInfo.fieldInfos[field].visible) {
                                            searchSettings[index].InfoWindowData.push({
                                                "DisplayText": webMapDetails.operationalLayers[j].popupInfo.fieldInfos[field].label + ":",
                                                "FieldName": "${" + webMapDetails.operationalLayers[j].popupInfo.fieldInfos[field].fieldName + "}"
                                            });
                                        }
                                    }
                                }
                            }
                        }
                    }
                } else {
                    alert(sharedNls.appErrorMessage.webmapTitleError);
                }
            }
        },


        /**
        * initialize map object when map is loading
        * @memberOf widgets/mapSettings/mapSettings
        */
        _mapOnLoad: function () {
            var home, extentPoints, mapDefaultExtent, i, graphicsLayer, buffergraphicsLayer, extent, routegraphicsLayer, highlightfeature, imgSource, imgCustomLogo;
            extentPoints = dojo.configData && dojo.configData.DefaultExtent && dojo.configData.DefaultExtent.split(",");
            extent = this._getQueryString('extent');
            if (extent === "") {
                if (!dojo.configData.WebMapId) {
                    mapDefaultExtent = new GeometryExtent({ "xmin": parseFloat(extentPoints[0]), "ymin": parseFloat(extentPoints[1]), "xmax": parseFloat(extentPoints[2]), "ymax": parseFloat(extentPoints[3]), "spatialReference": { "wkid": this.map.spatialReference.wkid} });
                    this.map.setExtent(mapDefaultExtent);
                }
            } else {
                mapDefaultExtent = extent.split(',');
                mapDefaultExtent = new GeometryExtent({ "xmin": parseFloat(mapDefaultExtent[0]), "ymin": parseFloat(mapDefaultExtent[1]), "xmax": parseFloat(mapDefaultExtent[2]), "ymax": parseFloat(mapDefaultExtent[3]), "spatialReference": { "wkid": this.map.spatialReference.wkid} });
                this.map.setExtent(mapDefaultExtent);
            }
            /**
            * load esri 'Home Button' widget
            */
            home = this._addHomeButton();
            home.extent = mapDefaultExtent;
            domConstruct.place(home.domNode, query(".esriSimpleSliderIncrementButton")[0], "after");
            home.startup();
            if (dojo.configData.CustomLogoUrl && lang.trim(dojo.configData.CustomLogoUrl).length !== 0) {
                if (dojo.configData.CustomLogoUrl.match("http:") || dojo.configData.CustomLogoUrl.match("https:")) {
                    imgSource = dojo.configData.CustomLogoUrl;
                } else {
                    imgSource = dojoConfig.baseURL + dojo.configData.CustomLogoUrl;
                }
                imgCustomLogo = domConstruct.create("img", { "src": imgSource, "class": "esriCTCustomMapLogo" }, dom.byId("esriCTParentDivContainer"));
                domClass.add(imgCustomLogo, "esriCTCustomMapLogoBottom");
            }
            if (!dojo.configData.WebMapId) {
                for (i in dojo.configData.OperationalLayers) {
                    if (dojo.configData.OperationalLayers.hasOwnProperty(i)) {
                        this._addOperationalLayerToMap(i, dojo.configData.OperationalLayers[i]);
                    }
                }
                if (dojo.configData.BaseMapLayers.length > 1) {
                    this._showBasMapGallery();
                }
            }
            graphicsLayer = new GraphicsLayer();
            graphicsLayer.id = this.tempGraphicsLayerId;
            this.map.addLayer(graphicsLayer);
            buffergraphicsLayer = new GraphicsLayer();
            buffergraphicsLayer.id = this.tempBufferLayerId;
            this.map.addLayer(buffergraphicsLayer);
            this._addLayerLegend();
            routegraphicsLayer = new GraphicsLayer();
            routegraphicsLayer.id = this.routeLayerId;
            highlightfeature = new GraphicsLayer();
            highlightfeature.id = this.highlightLayerId;
            this.map.addLayer(highlightfeature);
            this.map.addLayer(routegraphicsLayer);
            this._showBasMapGallery();
            graphicsLayer.on("graphic-add", lang.hitch(this, function (feature) {
                topic.publish("doBufferHandler", feature);
            }));
        },

        /**
        * set infowindow position
        * @memberOf widgets/mapSettings/mapSettings
        */
        _onSetInfoWindowPosition: function (infoTitle, divInfoDetailsTab, screenPoint, infoPopupHeight, infoPopupWidth) {
            this.infoWindowPanel.resize(infoPopupHeight, infoPopupWidth);
            this.infoWindowPanel.hide();
            this.infoWindowPanel.show(divInfoDetailsTab, screenPoint);
        },

        /**
        * show infoWindow on Map
        * @param {Map point} mapPoint
        * @memberOf widgets/mapSettings/mapSettings
        */
        _showInfoWindowOnMap: function (mapPoint) {
            var index, deferredListResult,
                onMapFeaturArray = [],
                featureArray = [];
            this.counter = 0;
            for (index = 0; index < dojo.configData.SearchSettings.length; index++) {
                this._executeQueryTask(index, mapPoint, onMapFeaturArray);
            }
            deferredListResult = new DeferredList(onMapFeaturArray);
            deferredListResult.then(lang.hitch(this, function (result) {
                var j, i;

                if (result) {
                    for (j = 0; j < result.length; j++) {
                        if (result[j][0] === true) {
                            if (result[j][1].features.length > 0) {
                                for (i = 0; i < result[j][1].features.length; i++) {
                                    featureArray.push({
                                        attr: result[j][1].features[i],
                                        layerId: j,
                                        fields: result[j][1].fields
                                    });
                                }
                            }
                        }
                    }
                    this._fetchQueryResults(featureArray, mapPoint, this.map);
                }
            }), function (err) {
                alert(err.message);
            });
        },

        /**
        * execute query for the layer
        * @param {number}index of feature layer
        * @param {Map point} mapPoint
        * @param {array} onMapFeaturArray Contains array of fearture layer URL
        * @memberOf widgets/mapSettings/mapSettings
        */
        _executeQueryTask: function (index, mapPoint, onMapFeaturArray) {
            var queryTask, queryLayer, queryOnRouteTask;
            queryTask = new esri.tasks.QueryTask(dojo.configData.SearchSettings[index].QueryURL);
            queryLayer = new esri.tasks.Query();
            queryLayer.outSpatialReference = this.map.spatialReference;
            queryLayer.returnGeometry = true;
            queryLayer.maxAllowableOffset = 100;
            queryLayer.geometry = this._extentFromPoint(mapPoint);
            queryLayer.outFields = ["*"];
            queryOnRouteTask = queryTask.execute(queryLayer, lang.hitch(this, function (results) {
                var deferred = new Deferred();
                deferred.resolve(results);
                return deferred.promise;
            }), function (err) {
                alert(err.message);
            });
            onMapFeaturArray.push(queryOnRouteTask);
        },

        /**
        * set extent from mappoint
        * @param {Map point} mapPoint
        * @memberOf widgets/mapSettings/mapSettings
        */
        _extentFromPoint: function (point) {
            var tolerance, screenPoint, pnt1, pnt2, mapPoint1, mapPoint2;
            tolerance = 15;
            screenPoint = this.map.toScreen(point);
            pnt1 = new esri.geometry.Point(screenPoint.x - tolerance, screenPoint.y + tolerance);
            pnt2 = new esri.geometry.Point(screenPoint.x + tolerance, screenPoint.y - tolerance);
            mapPoint1 = this.map.toMap(pnt1);
            mapPoint2 = this.map.toMap(pnt2);
            return new esri.geometry.Extent(mapPoint1.x, mapPoint1.y, mapPoint2.x, mapPoint2.y, this.map.spatialReference);
        },

        /**
        * featch infowindow data from query task result
        * @param {Array} featureArray Contains features array on map
        * @param {Map point} mapPoint
        * @param {Object} map
        * @memberOf widgets/mapSettings/mapSettings
        */
        _fetchQueryResults: function (featureArray, mapPoint, map) {
            var point;
            if (featureArray.length > 0) {
                if (featureArray.length === 1) {
                    dojo.showInfo = true;
                    topic.publish("createInfoWindowContent", featureArray[0].attr.geometry, featureArray[0].attr.attributes, featureArray[0].layerId, null, null, null);
                } else {
                    this.count = 0;
                    dojo.showInfo = true;
                    if (featureArray[this.count].attr.geometry.type === "polyline") {
                        point = featureArray[this.count].attr.geometry.getPoint(0, 0);
                        topic.publish("createInfoWindowContent", point, featureArray[0].attr.attributes, featureArray[0].layerId, null, featureArray, this.count);
                    } else {
                        topic.publish("createInfoWindowContent", featureArray[0].attr.geometry, featureArray[0].attr.attributes, featureArray[0].layerId, null, featureArray, this.count);
                    }
                    topic.publish("hideProgressIndicator");
                    topic.publish("hideProgressIndicator");
                }
            } else {
                topic.publish("hideProgressIndicator");
            }
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
        * generate layer URL for infoWindow
        * @param {Layer} operationalLayers Contains service layer URL
        * @memberOf widgets/mapSettings/mapSettings
        */
        _generateLayerURL: function (operationalLayers) {
            var infoWindowSettings, searchSettings, i, str, layerTitle, layerId, index, infoIndex;

            infoWindowSettings = dojo.configData.InfoWindowSettings;
            searchSettings = dojo.configData.SearchSettings;
            for (i = 0; i < operationalLayers.length; i++) {
                if (dojo.configData.WebMapId && lang.trim(dojo.configData.WebMapId).length !== 0) {
                    str = operationalLayers[i].url.split('/');
                    layerTitle = str[str.length - 3];
                    layerId = str[str.length - 1];
                    for (index = 0; index < searchSettings.length; index++) {
                        if (searchSettings[index].Title && searchSettings[index].QueryLayerId) {
                            if (layerTitle === searchSettings[index].Title && layerId === searchSettings[index].QueryLayerId) {
                                searchSettings[index].QueryURL = str.join("/");
                            }
                        }
                    }
                    for (infoIndex = 0; infoIndex < infoWindowSettings.length; infoIndex++) {
                        if (infoWindowSettings[infoIndex].Title && infoWindowSettings[infoIndex].QueryLayerId) {
                            if (layerTitle === infoWindowSettings[infoIndex].Title && layerId === infoWindowSettings[infoIndex].QueryLayerId) {
                                infoWindowSettings[infoIndex].InfoQueryURL = str.join("/");
                            }
                        }
                    }
                } else {
                    if (operationalLayers[i].ServiceURL) {
                        str = operationalLayers[i].ServiceURL.split('/');
                        layerTitle = str[str.length - 3];
                        layerId = str[str.length - 1];
                        for (index = 0; index < searchSettings.length; index++) {
                            if (searchSettings[index].Title && searchSettings[index].QueryLayerId) {
                                if (layerTitle === searchSettings[index].Title && layerId === searchSettings[index].QueryLayerId) {
                                    searchSettings[index].QueryURL = str.join("/");
                                }
                            }
                        }
                        for (infoIndex = 0; infoIndex < infoWindowSettings.length; infoIndex++) {
                            if (infoWindowSettings[infoIndex].Title && infoWindowSettings[infoIndex].QueryLayerId) {
                                if (layerTitle === infoWindowSettings[infoIndex].Title && layerId === infoWindowSettings[infoIndex].QueryLayerId) {
                                    infoWindowSettings[infoIndex].InfoQueryURL = str.join("/");
                                }
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
        * @return {object} basMapGallery widget
        * @memberOf widgets/mapSettings/mapSettings
        */
        _showBasMapGallery: function () {
            var basMapGallery = new BaseMapGallery({
                map: this.map
            }, domConstruct.create("div", {}, null));
            return basMapGallery;
        },

        /**
        * load and add operational layers depending on their LoadAsServiceType specified in configuration file
        * @param {int} index Layer order specified in configuration file
        * @param {object} layerInfo Layer settings specified in configuration file
        * @memberOf widgets/mapSettings/mapSettings
        */
        _addOperationalLayerToMap: function (index, layerInfo) {
            var layerMode, featureLayer;
            layerMode = null;
            if (layerInfo.LoadAsServiceType.toLowerCase() === "feature") {
                /**
                * set layerMode of the operational layer if it's type is feature
                */
                switch (layerInfo.layermode && layerInfo.layermode.toLowerCase()) {
                case "ondemand":
                    layerMode = FeatureLayer.MODE_ONDEMAND;
                    break;
                case "selection":
                    layerMode = FeatureLayer.MODE_SELECTION;
                    break;
                default:
                    layerMode = FeatureLayer.MODE_SNAPSHOT;
                    break;
                }
                /**
                * load operational layer if it's type is feature along with its layer mode
                */
                featureLayer = new FeatureLayer(layerInfo.ServiceURL, {
                    id: "index",
                    mode: layerMode,
                    outFields: ["*"],
                    displayOnPan: false
                });
                this.map.addLayer(featureLayer);
            } else if (layerInfo.LoadAsServiceType.toLowerCase() === "dynamic") {
                this._addDynamicLayerService(layerInfo);
            }
        },

        /**
        * load the layer as dynamic service type
        * @memberOf widgets/mapSettings/mapSettings
        */
        _addDynamicLayerService: function (layerInfo) {
            var str, lastIndex, layerTitle;

            clearTimeout(this.stagedSearch);
            str = layerInfo.ServiceURL.split('/');
            lastIndex = str[str.length - 1];
            if (isNaN(lastIndex) || lastIndex === "") {
                if (lastIndex === "") {
                    layerTitle = str[str.length - 3];
                } else {
                    layerTitle = str[str.length - 2];
                }
            } else {
                layerTitle = str[str.length - 3];
            }
            this.stagedSearch = setTimeout(lang.hitch(this, function () {
                this._addServiceLayers(layerTitle, layerInfo.ServiceURL);
            }), 500);
        },

        /**
        * add service layer as dynamic service type
        * @param {number} layerId is a ID of service URL
        * @param {Layer} layerURL Contains service URL of feature layer
        * @memberOf widgets/mapSettings/mapSettings
        */
        _addServiceLayers: function (layerId, layerURL) {
            var dynamicLayer, imageParams, lastIndex, dynamicLayerId;
            imageParams = new ImageParameters();
            lastIndex = layerURL.lastIndexOf('/');
            dynamicLayerId = layerURL.substr(lastIndex + 1);
            if (isNaN(dynamicLayerId) || dynamicLayerId === "") {
                if (isNaN(dynamicLayerId)) {
                    dynamicLayer = layerURL + "/";
                } else if (dynamicLayerId === "") {
                    dynamicLayer = layerURL;
                }
                this._createDynamicServiceLayer(dynamicLayer, imageParams, layerId);
            } else {
                imageParams.layerIds = [dynamicLayerId];
                dynamicLayer = layerURL.substring(0, lastIndex);
                this._createDynamicServiceLayer(dynamicLayer, imageParams, layerId);
            }
        },

        /**
        * create dynamic service layer as dynamic service type
        * @param {Object} dynamicLayer is use for dynamic type of service URL
        * @param {Object} imageParams Contains the images used in service URL
        * @param {Number} layerId is Id for service URL
        * @memberOf widgets/mapSettings/mapSettings
        */
        _createDynamicServiceLayer: function (dynamicLayer, imageParams, layerId) {
            var dynamicMapService;
            dynamicMapService = new ArcGISDynamicMapServiceLayer(dynamicLayer, {
                imageParameters: imageParams,
                id: layerId,
                visible: true
            });
            this.map.addLayer(dynamicMapService);
        },

        /**
        * initialize the object of legend box
        * @memberOf widgets/mapSettings/mapSettings
        */
        _addLegendBox: function () {
            var mmap = this.map;
            this.legendObject = new Legends({
                map: mmap,
                isExtentBasedLegend: true
            }, domConstruct.create("div", {}, null));
            return this.legendObject;
        },

        /**
        * create collection for map /feature server for legend
        * @memberOf widgets/mapSettings/mapSettings
        */
        _addLayerLegend: function () {
            var mapServerArray, legendObject;
            mapServerArray = [];

            if (dojo.configData.OperationalLayers[0]) {
                if (dojo.configData.OperationalLayers[0].ServiceURL) {
                    mapServerArray.push(dojo.configData.OperationalLayers[0].ServiceURL);
                }
            }
            legendObject = this._addLegendBox();
            legendObject.startup(mapServerArray);
        },

        /**
        * add legend for the web map
        * @memberOf widgets/mapSettings/mapSettings
        */
        _addLayerLegendWebmap: function (response) {
            var mapServerArray = [], i, j, legendObject, webMapDetails, layer;
            webMapDetails = response.itemInfo.itemData;
            for (j = 0; j < webMapDetails.operationalLayers.length; j++) {
                if (webMapDetails.operationalLayers[j].layerObject && webMapDetails.operationalLayers[j].layerObject.layerInfos) {
                    for (i = 0; i < webMapDetails.operationalLayers[j].layerObject.layerInfos.length; i++) {
                        layer = webMapDetails.operationalLayers[j].url + "/" + webMapDetails.operationalLayers[j].layerObject.layerInfos[i].id;
                        mapServerArray.push(layer);
                    }
                } else {
                    mapServerArray.push(webMapDetails.operationalLayers[j].url);
                }
            }
            legendObject = this._addLegendBox();
            legendObject.startup(mapServerArray);
        },

        /**
        * return current map instance
        * @return {object} Current map instance
        * @memberOf widgets/mapSettings/mapSettings
        */
        getMapInstance: function () {
            return this.map;
        }
    });
});
