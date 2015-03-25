﻿/*global define,dojo,dojoConfig,esri,alert,console */
/*jslint browser:true,sloppy:true,nomen:true,unparam:true,plusplus:true,indent:4 */
/*
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
    "dojo/_base/array",
    "dojo/query",
    "dojo/on",
    "dojo/dom",
    "dojo/dom-class",
    "dojo/text!./templates/legendsTemplate.html",
    "dojo/topic",
    "dojo/Deferred",
    "dojo/promise/all",
    "dijit/_WidgetBase",
    "dijit/_TemplatedMixin",
    "dijit/_WidgetsInTemplateMixin",
    "dojo/i18n!application/js/library/nls/localizedStrings",
    "dojo/_base/Color",
    "esri/request",
    "esri/tasks/query",
    "esri/tasks/QueryTask",
    "dijit/a11yclick"
], function (declare, domConstruct, domStyle, lang, array, query, on, dom, domClass, template, topic, Deferred, all, _WidgetBase, _TemplatedMixin, _WidgetsInTemplateMixin, sharedNls, Color, esriRequest, Query, QueryTask, a11yclick) {
    //========================================================================================================================//

    return declare([_WidgetBase, _TemplatedMixin, _WidgetsInTemplateMixin], {
        templateString: template,
        sharedNls: sharedNls,
        layerObject: null,
        _layerCollection: {},
        rendererArray: [],
        isExtentBasedLegend: false,
        webmapUpdatedRenderer: null,
        hostedLayersJSON: null,
        newLeft: 0,
        legendListWidth: [],
        indexesForLayer: [],
        divLegendContainer: null,
        divLegendContent: null,
        widthLegendContentDiv: 0,

        /**
        * create legend widget
        * @class
        * @name widgets/legend/legend
        */
        postCreate: function () {
            this._createLegendContainerUI();
            topic.subscribe("setMaxLegendLength", lang.hitch(this, this._setMaxLegendLengthResult));
            topic.subscribe("setMinLegendLength", lang.hitch(this, this._setMinLegendLengthResult));
            topic.subscribe("setMap", lang.hitch(this, function (map) {
                this.map = map;
            }));
            topic.subscribe("updateLegends", lang.hitch(this, this._updatedLegend));
            this.own(on(window, "resize", lang.hitch(this, this._displaySlideControls)));
            if (this.isExtentBasedLegend) {
                this.map.on("extent-change", lang.hitch(this, function (evt) {
                    this._updatedLegend(evt.extent);
                }));
            }
        },

        /**
        * initiates the creation of legend
        * @memberOf widgets/legends/legends
        */
        startup: function (layerArray, updatedRendererArray, mapExtent) {
            var mapServerURL, matchedString, index, hostedDefArray = [], defArray = [], params, layersRequest, hostedLayers, i, featureLayerUrl, layerIndex, legendCreated;
            this.mapServerArray = [];
            this.featureServerArray = [];
            this.hostedLayersJSON = null;
            this.legendListWidth = [];
            if (!layerArray.length && !updatedRendererArray) {
                domConstruct.create("span", { "innerHTML": sharedNls.errorMessages.noLegend, "class": "esriCTDivNoLegendContainer" }, this.divLegendContent);
                return;
            }
            this.webmapUpdatedRenderer = updatedRendererArray;
            hostedLayers = this._filterHostedFeatureServices(layerArray);
            for (i = 0; i < hostedLayers.length; i++) {
                params = {
                    url: hostedLayers[i].url,
                    content: { f: "json" },
                    handleAs: "json",
                    callbackParamName: "callback"
                };
                layersRequest = esriRequest(params);
                this._getLayerDetail(layersRequest, hostedDefArray);
            }
            if (hostedDefArray.length > 0) {
                all(hostedDefArray).then(lang.hitch(this, function (result) {
                    if (result.length === 0) {
                        this.hostedLayersJSON = null;
                    } else {
                        this.hostedLayersJSON = {};
                        if (this.webmapUpdatedRenderer === null && this._layerCollection === null) {
                            domConstruct.empty(this.divLegendContent);
                        }
                    }
                    for (i = 0; i < result.length; i++) {
                        if (result[i]) {
                            this.hostedLayersJSON[hostedLayers[i].url] = result[i];
                            this.hostedLayersJSON[hostedLayers[i].url].title = hostedLayers[i].title;
                        }
                    }
                    this._displayHostedLayerRenderer(mapExtent);
                    this._addlegendListWidth();
                }));
            }

            for (index = 0; index < layerArray.length; index++) {
                matchedString = layerArray[index].url.match(/FeatureServer/gi);
                if (matchedString) {
                    featureLayerUrl = layerArray[index].url;
                    layerArray[index].url = layerArray[index].url.replace("/" + matchedString[0], "/MapServer");
                } else {
                    featureLayerUrl = null;
                }
                mapServerURL = layerArray[index].url.split("/");
                layerIndex = mapServerURL[mapServerURL.length - 1];
                if (isNaN(layerIndex) || layerIndex === "") {
                    if (layerIndex === "") {
                        mapServerURL.splice(mapServerURL.length - 1, 1);
                    }
                    mapServerURL = mapServerURL.join("/");
                    this.mapServerArray.push({ "url": mapServerURL, "featureLayerUrl": featureLayerUrl, "all": true });
                } else {
                    mapServerURL.pop();
                    mapServerURL = mapServerURL.join("/");
                    if (!this.indexesForLayer[mapServerURL]) {
                        this.indexesForLayer[mapServerURL] = [];
                    }
                    this.indexesForLayer[mapServerURL].push(layerIndex);
                    this.mapServerArray.push({ "url": mapServerURL, "featureLayerUrl": featureLayerUrl });
                }
            }

            this.mapServerArray = this._removeDuplicate(this.mapServerArray);
            for (index = 0; index < this.mapServerArray.length; index++) {
                params = {
                    url: this.mapServerArray[index].url + "/legend",
                    content: { f: "json" },
                    handleAs: "json",
                    callbackParamName: "callback"
                };
                layersRequest = esriRequest(params);
                this._getLayerDetail(layersRequest, defArray);
            }
            all(defArray).then(lang.hitch(this, function (result) {
                this._layerCollection = {};
                legendCreated = [];
                for (index = 0; index < result.length; index++) {
                    if (result[index]) {
                        legendCreated.push(this._createLegendList(result[index], this.mapServerArray[index], layerArray));
                    }
                }
                if (!legendCreated.length) {
                    this._layerCollection = null;
                } else {
                    this._addFieldValue(this._layerCollection, mapExtent);
                }
            }));
            if (this.webmapUpdatedRenderer) {
                this._displayWebmapRenderer(mapExtent);
                this._addlegendListWidth();
            }
        },

        /**
        * update legend data
        * @memberOf widgets/legends/legends
        */
        _updatedLegend: function (geometry) {
            var defQueryArray = [], queryResult, resultListArray = [], i;

            this.rendererArray = [];
            this.legendListWidth = [];
            this._resetLegendContainer();
            domConstruct.empty(this.divLegendContent);
            this._addlegendListWidth(this.legendListWidth);
            domStyle.set(this.divRightArrow, "display", "none");
            domStyle.set(this.divLeftArrow, "display", "none");
            domConstruct.create("span", { innerHTML: sharedNls.errorMessages.loadingText, "class": "esriCTDivLegendLoadingContainer" }, this.divLegendContent);
            if (!geometry) {
                domConstruct.empty(this.divLegendContent);
                domConstruct.create("span", { innerHTML: sharedNls.errorMessages.noLegend, "class": "esriCTDivNoLegendContainer" }, this.divLegendContent);
                domStyle.set(this.divRightArrow, "display", "none");
                return;
            }
            queryResult = this._setQueryParams(geometry);
            this._queryLegendOnMapExtent(this._layerCollection, defQueryArray, queryResult, false);
            this._queryLegendOnMapExtent(this.hostedLayersJSON, defQueryArray, queryResult, true);
            this._queryLegendOnMapExtent(this.webmapUpdatedRenderer, defQueryArray, queryResult, true);
            if (defQueryArray.length > 0) {
                all(defQueryArray).then(lang.hitch(this, function (result) {
                    domConstruct.empty(this.divLegendContent);
                    this.legendListWidth = [];
                    for (i = 0; i < result.length; i++) {
                        if (result[i] && result[i].count > 0) {
                            resultListArray.push(result[i]);
                            if (result[i].hasDrawingInfo) {
                                if (this.rendererArray[i].drawingInfo) {
                                    this._createLegendSymbol(this.rendererArray[i].drawingInfo, this.rendererArray[i].title);
                                } else if (this.rendererArray[i].layerDefinition) {
                                    this._createLegendSymbol(this.rendererArray[i].layerDefinition.drawingInfo, this.rendererArray[i].title);
                                } else {
                                    this._createLegendSymbol(this.rendererArray[i], this.rendererArray[i].title);
                                }
                            } else {
                                this._addLegendSymbol(this.rendererArray[i].renderer, this.rendererArray[i].title);
                            }
                        }
                    }
                    this._addlegendListWidth(this.legendListWidth);
                    if (resultListArray.length === 0) {
                        domConstruct.create("span", { "innerHTML": sharedNls.errorMessages.noLegend, "class": "esriCTDivNoLegendContainer" }, this.divLegendContent);
                    }
                }));
            } else {
                this.legendListWidth = [];
                domConstruct.empty(this.divLegendContent);
                this._addlegendListWidth(this.legendListWidth);
                domConstruct.create("span", { "innerHTML": sharedNls.errorMessages.noLegend, "class": "esriCTDivNoLegendContainer" }, this.divLegendContent);
            }
        },

        /**
        * query legend for current extent
        * @memberOf widgets/legends/legends
        */
        _queryLegendOnMapExtent: function (layerArray, defQueryArray, queryResult, hasDrawingInfo) {
            var layer, layerUrl, rendererObject, layerObject, index, i, fieldValue, currentTime = new Date();
            for (layer in layerArray) {
                if (layerArray.hasOwnProperty(layer)) {
                    layerUrl = layer;
                    if (layerArray[layer].featureLayerUrl) {
                        layerUrl = layerArray[layer].featureLayerUrl;
                    }
                    if (this._checkLayerVisibility(layerUrl)) {
                        layerObject = layerArray[layer];
                        if (!hasDrawingInfo) {
                            rendererObject = layerArray[layer].legend;
                            if (rendererObject && rendererObject.length) {
                                for (index = 0; index < rendererObject.length; index++) {
                                    rendererObject[index].layerUrl = layer;
                                    this.rendererArray.push({ "renderer": rendererObject[index], "title": layerArray[layer].layerName });
                                    if (layerObject.rendererType === "uniqueValue") {
                                        if (rendererObject[index].values) {
                                            if (layerObject.fieldType === "esriFieldTypeString") {
                                                fieldValue = "'" + rendererObject[index].values[0] + "'";
                                            } else {
                                                fieldValue = rendererObject[index].values[0];
                                            }
                                            queryResult.where = layerObject.fieldName + " = " + fieldValue + " AND " + currentTime.getTime() + "=" + currentTime.getTime();
                                        } else {
                                            queryResult.where = currentTime.getTime() + "=" + currentTime.getTime();
                                        }
                                    } else if (layerObject.rendererType === "classBreaks") {
                                        queryResult.where = rendererObject[index - 1] ? layerObject.fieldName + ">" + rendererObject[index - 1].values[0] + " AND " + layerObject.fieldName + "<=" + rendererObject[index].values[0] : layerObject.fieldName + "=" + rendererObject[index].values[0] + " AND " + currentTime.getTime().toString() + "=" + currentTime.getTime().toString();
                                    } else {
                                        queryResult.where = currentTime.getTime() + "=" + currentTime.getTime();
                                    }
                                    this._executeQueryTask(layer, defQueryArray, queryResult, hasDrawingInfo);
                                }
                            }
                        } else {
                            if (layerObject.drawingInfo) {
                                rendererObject = layerObject.drawingInfo.renderer;
                            } else {
                                rendererObject = layerObject.layerDefinition.drawingInfo.renderer;
                            }

                            if (rendererObject.type === "uniqueValue") {
                                for (i = 0; i < rendererObject.uniqueValueInfos.length; i++) {
                                    this.rendererArray.push({ "renderer": rendererObject.uniqueValueInfos[i], "title": layerObject.title });
                                    if (layerObject.fieldType === "esriFieldTypeString") {
                                        fieldValue = "'" + rendererObject.uniqueValueInfos[i].value + "'";
                                    } else {
                                        fieldValue = rendererObject.uniqueValueInfos[i].value;
                                    }
                                    if (rendererObject.uniqueValueInfos[i].value) {
                                        queryResult.where = layerObject.fieldName + " = " + fieldValue + " AND " + currentTime.getTime() + "=" + currentTime.getTime();
                                    } else {
                                        queryResult.where = currentTime.getTime() + "=" + currentTime.getTime();
                                    }
                                    this._executeQueryTask(layer, defQueryArray, queryResult, hasDrawingInfo);
                                }
                            } else if (rendererObject.type === "classBreaks") {
                                for (i = 0; i < rendererObject.classBreakInfos.length; i++) {
                                    this.rendererArray.push({ "renderer": rendererObject.classBreakInfos[i], "title": layerObject.title });
                                    queryResult.where = layerObject.fieldName + ">=" + rendererObject.classBreakInfos[i].minValue + " AND " + layerObject.fieldName + "<=" + rendererObject.classBreakInfos[i].maxValue + " AND " + currentTime.getTime().toString() + "=" + currentTime.getTime().toString();
                                    this._executeQueryTask(layer, defQueryArray, queryResult, hasDrawingInfo);
                                }
                            } else {
                                this.rendererArray.push(layerObject);
                                queryResult.where = currentTime.getTime() + "=" + currentTime.getTime();
                                this._executeQueryTask(layer, defQueryArray, queryResult, hasDrawingInfo);
                            }
                        }
                    }
                }
            }
        },

        /**
        * check layer visibility on map
        * @memberOf widgets/legends/legends
        */
        _checkLayerVisibility: function (layerUrl) {
            var layer, lastChar, mapLayerUrl, layerUrlIndex = layerUrl.split('/'),
                returnVal = false;
            layerUrlIndex = layerUrlIndex[layerUrlIndex.length - 1];
            for (layer in this.map._layers) {
                if (this.map._layers.hasOwnProperty(layer)) {
                    if (this.map._layers[layer].url === layerUrl) {
                        if (this.map._layers[layer].visibleAtMapScale || !this.isExtentBasedLegend) {
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
                            if (array.indexOf(this.map._layers[layer].visibleLayers, parseInt(layerUrlIndex, 10)) !== -1) {
                                if (this.isExtentBasedLegend && this.map._layers[layer].visibleAtMapScale) {
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
        * set legend container width to maximum
        * @memberOf widgets/legends/legends
        */
        _setMaxLegendLengthResult: function () {
            if (this.divLegendRightBox) {
                domClass.remove(this.divLegendBoxContent, "esriCTRightBorderNone");
                domClass.add(this.divLegendRightBox, "esriCTLegendRightBoxShift");
            }
            if (this.divRightArrow) {
                domClass.add(this.divRightArrow, "esriCTRightArrowShift");
            }
            this._resetSlideControls();
        },

        /**
        * set legend container width to minimum
        * @memberOf widgets/legends/legends
        */
        _setMinLegendLengthResult: function () {
            if (this.divLegendRightBox) {
                domClass.add(this.divLegendBoxContent, "esriCTRightBorderNone");
                domClass.replace(this.divLegendRightBox, "esriCTLegendRightBox", "esriCTLegendRightBoxShift");
            }
            if (this.divRightArrow) {
                domClass.replace(this.divRightArrow, "esriCTRightArrow", "esriCTRightArrowShift");
            }
            this._resetSlideControls();
        },

        /**
        * reset legend container
        * @memberOf widgets/legends/legends
        */
        _resetLegendContainer: function () {
            this.newLeft = 0;
            domStyle.set(this.divLegendContent, "left", this.newLeft + "px");
            this._resetSlideControls();
        },

        /**
        * create legendcontainer UI
        * @memberOf widgets/legends/legends
        */
        _createLegendContainerUI: function () {
            var legendOuterContainer;
            legendOuterContainer = query('.esriCTDivLegendBox', dom.byId("esriCTParentDivContainer"));

            if (query('.esriCTDivLegendBoxContent')[0]) {
                domConstruct.empty(query('.esriCTDivLegendBoxContent')[0]);
            }
            if (legendOuterContainer[0]) {
                domConstruct.destroy(legendOuterContainer[0].parentElement);
            }
            dom.byId("esriCTParentDivContainer").appendChild(this.divLegendBox);
            this.divLegendContainer = domConstruct.create("div", { "class": "esriCTDivLegendContainer" }, this.divLegendListContainer);
            this.divLegendContent = domConstruct.create("div", { "class": "esriCTDivLegendContent" }, this.divLegendContainer);
            this.divLeftArrow = domConstruct.create("div", { "class": "esriCTLeftArrow" }, this.divLegendBoxContent);
            on(this.divLeftArrow, a11yclick, lang.hitch(this, this._slideLeft));

            this.divRightArrow = domConstruct.create("div", { "class": "esriCTRightArrow" }, this.divLegendBoxContent);
            on(this.divRightArrow, a11yclick, lang.hitch(this, this._slideRight));
        },

        /**
        * slide legend data to right
        * @memberOf widgets/legends/legends
        */
        _slideRight: function () {
            var difference = this.divLegendContainer.offsetWidth - this.divLegendContent.offsetWidth;
            if (this.newLeft > difference) {
                domStyle.set(this.divLeftArrow, "display", "block");
                domStyle.set(this.divLeftArrow, "cursor", "pointer");
                this.newLeft = this.newLeft - (100 + 9);
                domStyle.set(this.divLegendContent, "left", this.newLeft + "px");
                this._resetSlideControls();
            }
        },

        /**
        * slide legend data to left
        * @memberOf widgets/legends/legends
        */
        _slideLeft: function () {
            if (this.newLeft < 0) {
                if (this.newLeft > -(100 + 9)) {
                    this.newLeft = 0;
                } else {
                    this.newLeft = this.newLeft + (100 + 9);
                }
                if (this.newLeft >= -10) {
                    this.newLeft = 0;
                }
                domStyle.set(this.divLegendContent, "left", this.newLeft + "px");
                this._resetSlideControls();
            }
        },

        /**
        * display slider controls
        * @memberOf widgets/legends/legends
        */
        _displaySlideControls: function () {
            if (dojo.window.getBox().w < this.widthLegendContentDiv) {
                domStyle.set(this.divRightArrow, "display", "block");
                domStyle.set(this.divRightArrow, "cursor", "pointer");
                this._addlegendListWidth();
            } else {
                this.newLeft = 0;
                domStyle.set(this.divRightArrow, "display", "none");
                domStyle.set(this.divRightArrow, "cursor", "default");
                domStyle.set(this.divLeftArrow, "display", "none");
                domStyle.set(this.divLeftArrow, "cursor", "default");
                domStyle.set(this.divLegendContent, "left", this.newLeft + "px");
                this._addlegendListWidth();
            }
        },

        /**
        * reset slider controls
        * @memberOf widgets/legends/legends
        */
        _resetSlideControls: function () {
            if (this.newLeft > this.divLegendContainer.offsetWidth - this.divLegendContent.offsetWidth) {
                domStyle.set(this.divRightArrow, "display", "block");
                domStyle.set(this.divRightArrow, "cursor", "pointer");
            } else {
                domStyle.set(this.divRightArrow, "display", "none");
                domStyle.set(this.divRightArrow, "cursor", "default");
            }
            if (this.newLeft === 0) {
                domStyle.set(this.divLeftArrow, "display", "none");
                domStyle.set(this.divLeftArrow, "cursor", "default");
            } else {
                domStyle.set(this.divLeftArrow, "display", "block");
                domStyle.set(this.divLeftArrow, "cursor", "pointer");
            }
        },

        /**
        * set query parameters to fetch features present in the current extent
        * @memberOf widgets/legends/legends
        */
        _setQueryParams: function (currentExtent) {
            var queryParams = new Query();
            queryParams.outFields = ["*"];
            if (this.isExtentBasedLegend) {
                queryParams.geometry = currentExtent;
                queryParams.spatialRelationship = "esriSpatialRelIntersects";
                queryParams.returnGeometry = false;
            }
            return queryParams;
        },

        /**
        * execute query task for the number of features present in the current extent
        * @memberOf widgets/legends/legends
        */
        _executeQueryTask: function (layer, defQueryArray, queryParams, hasDrawingInfo) {
            var defResult = [], queryTask, queryDeferred = new Deferred();
            queryTask = new QueryTask(layer);
            defResult.hasDrawingInfo = hasDrawingInfo;
            defResult.count = 0;
            if (!this.isExtentBasedLegend) {
                queryParams.where = "1=1";
            }
            queryTask.executeForCount(queryParams, lang.hitch(this, function (count) {
                defResult.count = count;
                queryDeferred.resolve(defResult);
            }), function () {
                queryDeferred.resolve();
            });
            defQueryArray.push(queryDeferred);
        },

        /**
        * display webmap generated renderers
        * @memberOf widgets/legends/legends
        */
        _displayWebmapRenderer: function (mapExtent) {
            var layer;
            for (layer in this.webmapUpdatedRenderer) {
                if (this.webmapUpdatedRenderer.hasOwnProperty(layer)) {
                    this._setFieldValue(this.webmapUpdatedRenderer[layer].layerDefinition.drawingInfo, this.webmapUpdatedRenderer[layer]);
                    this._appendFieldType(this.webmapUpdatedRenderer[layer], this.webmapUpdatedRenderer[layer].layerObject);
                }
            }
            this._updatedLegend(mapExtent);
        },

        /**
        * display hosted layer renderers
        * @memberOf widgets/legends/legends
        */
        _displayHostedLayerRenderer: function (mapExtent) {
            var layer;
            for (layer in this.hostedLayersJSON) {
                if (this.hostedLayersJSON.hasOwnProperty(layer)) {
                    this._setFieldValue(this.hostedLayersJSON[layer].drawingInfo, this.hostedLayersJSON[layer]);
                    this._appendFieldType(this.hostedLayersJSON[layer], null);
                }
            }
            this._updatedLegend(mapExtent);
        },

        /**
        * create legend symbols
        * @memberOf widgets/legends/legends
        */
        _createLegendSymbol: function (layerData, layerTitle) {
            var renderer, divLegendImage, divLegendLabel, rendererObject, i, legendWidth, divLegendList, imageHeightWidth, height, width;
            if (layerData) {
                renderer = layerData.renderer;
                if (renderer && renderer.label) {
                    layerTitle = renderer.label;
                }
                if (renderer && renderer.symbol) {
                    this._createSymbol(renderer.symbol.type, renderer.symbol.url, renderer.symbol.color,
                        renderer.symbol.width, renderer.symbol.height, renderer.symbol.imageData, layerTitle);
                } else if (renderer) {
                    if (renderer.infos) {
                        rendererObject = renderer.info;
                    } else if (renderer.uniqueValueInfos) {
                        rendererObject = renderer.uniqueValueInfos;
                    } else if (renderer.classBreakInfos) {
                        rendererObject = renderer.classBreakInfos;
                    } else {
                        rendererObject = renderer;
                    }
                    if (rendererObject.label) {
                        layerTitle = rendererObject.label;
                    }
                    if (rendererObject.symbol) {
                        this._createSymbol(rendererObject.symbol.type, rendererObject.symbol.url, rendererObject.symbol.color,
                            rendererObject.symbol.width, rendererObject.symbol.height, rendererObject.symbol.imageData, layerTitle);
                    } else {
                        for (i = 0; i < rendererObject.length; i++) {
                            if (!rendererObject[i].label) {
                                rendererObject[i].label = layerTitle;
                            }
                            this._createSymbol(rendererObject[i].symbol.type, rendererObject[i].symbol.url, rendererObject[i].symbol.color,
                                rendererObject[i].symbol.width, rendererObject[i].symbol.height, rendererObject[i].symbol.imageData, rendererObject[i].label);
                        }
                    }
                } else if (renderer && renderer.defaultSymbol) {
                    this._createSymbol(renderer.defaultSymbol.type, renderer.defaultSymbol.url, renderer.defaultSymbol.color,
                        renderer.defaultSymbol.width, renderer.defaultSymbol.height, renderer.defaultSymbol.imageData, layerTitle);
                } else {
                    divLegendList = domConstruct.create("div", { "class": "esriCTDivLegendList" }, this.divLegendContent);
                    divLegendImage = domConstruct.create("div", { "class": "esriCTDivLegend" }, divLegendList);
                    if (renderer && renderer.symbol.url) {
                        height = renderer.symbol.height ? renderer.symbol.height < 5 ? 5 : renderer.symbol.height : 15;
                        width = renderer.symbol.width ? renderer.symbol.width < 5 ? 5 : renderer.symbol.width : 15;
                        imageHeightWidth = { width: width + 'px', height: height + 'px' };
                        domConstruct.create("img", {
                            "src": renderer.symbol.url,
                            "style": imageHeightWidth
                        }, divLegendImage);
                        divLegendLabel = domConstruct.create("div", { "class": "esriCTDivLegendLabel" }, divLegendList);
                        legendWidth = divLegendLabel.offsetWidth + width + 10;
                        this.legendListWidth.push(legendWidth);
                    }
                }
            }
        },

        /**
        * creates symbol with or without label for displaying in the legend
        * @memberOf widgets/legends/legends
        */
        _createSymbol: function (symbolType, url, color, width, height, imageData, label) {
            var bgColor, divLegendList, divLegendLabel, divLegendImage, divSymbol, legendWidth;
            divLegendList = domConstruct.create("div", { "class": "esriCTDivLegendList" }, this.divLegendContent);
            divLegendImage = domConstruct.create("div", { "class": "esriCTDivLegend" }, null);
            height = height ? height < 5 ? 5 : height : 20;
            width = width ? width < 5 ? 5 : width : 20;
            if (symbolType === "picturemarkersymbol" && url) {
                domConstruct.create("img", {
                    "src": url,
                    "style": "width:" + width + "px; height:" + height + "px"
                }, divLegendImage);
                divLegendList.appendChild(divLegendImage);
            } else if (symbolType === "esriPMS" && url) {
                domConstruct.create("img", {
                    "src": "data:image/gif;base64," + imageData,
                    "style": "width:" + width + "px; height:" + height + "px"
                }, divLegendImage);
                divLegendList.appendChild(divLegendImage);
            } else {
                divSymbol = document.createElement("div");
                if (color.r || color.r === 0) {
                    if (color.a || color.a === 0) {
                        bgColor = 'rgba(' + color.r + ',' + color.g + ',' + color.b + ',' + color.a + ')';
                    } else {
                        bgColor = 'rgb(' + color.r + ',' + color.g + ',' + color.b + ')';
                    }
                } else {
                    if (Color.fromArray(color).toHex()) {
                        bgColor = Color.fromArray(color).toHex();
                    } else {
                        bgColor = Color.fromArray([255, 0, 255]).toHex();
                    }
                    if (color.length > 3) {
                        divSymbol.style.opacity = color[3];
                    }
                }
                divSymbol.style.background = bgColor;
                divSymbol.style.height = height + "px";
                divSymbol.style.width = width + "px";
                divLegendImage.appendChild(divSymbol);
                divLegendList.appendChild(divLegendImage);
            }
            divLegendLabel = domConstruct.create("div", { "class": "esriCTDivLegendLabel", "innerHTML": label }, divLegendList);
            legendWidth = divLegendLabel.offsetWidth + width + 10;
            this.legendListWidth.push(legendWidth);
        },

        /**
        * identify hosted feature services from the layer array
        * @memberOf widgets/legends/legends
        */
        _filterHostedFeatureServices: function (layerArray) {
            var hostedLayers = [], layerDetails, index;
            for (index = 0; index < layerArray.length; index++) {
                if (layerArray[index].url.match(/FeatureServer/gi)) {
                    layerDetails = layerArray[index].url.split("/");
                    if (layerDetails[5] && layerDetails[5].toLowerCase && layerDetails[5].toLowerCase() === "rest") {
                        hostedLayers.push(layerArray[index]);
                        layerArray.splice(index, 1);
                        index--;
                    }
                }
            }
            return hostedLayers;
        },

        /**
        * add field values
        * @memberOf widgets/legends/legends
        */
        _addFieldValue: function (layerCollectionArray, mapExtent) {
            var defArray = [], layerTempArray = [], params, layer, layersRequest, i;
            for (layer in layerCollectionArray) {
                if (layerCollectionArray.hasOwnProperty(layer)) {
                    layerTempArray.push(layer);
                    params = {
                        url: layer,
                        content: {
                            f: "json"
                        },
                        callbackParamName: "callback"
                    };
                    layersRequest = esriRequest(params);
                    this._getLayerDetail(layersRequest, defArray);
                }
            }
            all(defArray).then(lang.hitch(this, function (result) {
                for (i = 0; i < result.length; i++) {
                    if (result[i]) {
                        if (layerCollectionArray[layerTempArray[i]].layerDefinition && layerCollectionArray[layerTempArray[i]].layerDefinition.drawingInfo) {
                            this._setFieldValue(layerCollectionArray[layerTempArray[i]].layerDefinition.drawingInfo, layerCollectionArray[layerTempArray[i]]);
                            if (!layerCollectionArray[layerTempArray[i]].title) {
                                layerCollectionArray[layerTempArray[i]].title = layerCollectionArray[layerTempArray[i]].name;
                            }
                        } else {
                            this._setFieldValue(result[i].drawingInfo, layerCollectionArray[layerTempArray[i]]);
                        }
                        this._appendFieldType(layerCollectionArray[layerTempArray[i]], result[i]);
                    }
                }
                this._updatedLegend(mapExtent);
            }));
        },

        /**
        * add field type
        * @memberOf widgets/legends/legends
        */
        _appendFieldType: function (layerCollection, layerObject) {
            var i;
            if (!layerObject) {
                layerObject = layerCollection;
            }
            if (layerCollection.fieldName) {
                for (i = 0; i < layerObject.fields.length; i++) {
                    if (layerObject.fields && layerObject.fields[i].name === layerCollection.fieldName) {
                        layerCollection.fieldType = layerObject.fields[i].type;
                        break;
                    }
                }
            }
        },

        /**
        * get layer json data
        * @memberOf widgets/legends/legends
        */
        _getLayerDetail: function (layersRequest, defArray) {
            var deferred = new Deferred();
            layersRequest.then(function (response) {
                deferred.resolve(response);
            }, function () {
                deferred.resolve();
            });
            defArray.push(deferred);
        },

        /**
        * set field values for unique value and class breaks renderers
        * @memberOf widgets/legends/legends
        */
        _setFieldValue: function (layerDrawingInfo, layerCollectionArray) {
            if (layerDrawingInfo && layerDrawingInfo.renderer && layerDrawingInfo.renderer.type === "uniqueValue") {
                layerCollectionArray.rendererType = "uniqueValue";
                layerCollectionArray.fieldName = layerDrawingInfo.renderer.field1 || layerDrawingInfo.renderer.field2 || layerDrawingInfo.renderer.field3;
            } else if (layerDrawingInfo && layerDrawingInfo.renderer && layerDrawingInfo.renderer.type === "classBreaks") {
                layerCollectionArray.rendererType = "classBreaks";
                layerCollectionArray.fieldName = layerDrawingInfo.renderer.field;
            }
        },

        /**
        * remove redundant data
        * @memberOf widgets/legends/legends
        */
        _removeDuplicate: function (mapServerArray) {
            var filterArray = [], fliteredArray = [];
            array.filter(mapServerArray, function (item) {
                if (array.indexOf(filterArray, item.url) === -1) {
                    fliteredArray.push(item);
                    filterArray.push(item.url);
                }
            });
            return fliteredArray;
        },

        /**
        * create legend list
        * @memberOf widgets/legends/legends
        */
        _createLegendList: function (layerList, mapServerUrl, layerArray) {
            var layerURL, i, isLegendCreated = false, layerName;

            if (layerList && layerList.layers && layerList.layers.length > 0) {
                for (i = 0; i < layerList.layers.length; i++) {
                    layerList.layers[i].featureLayerUrl = mapServerUrl.featureLayerUrl;
                    if (mapServerUrl.all || array.indexOf(this.indexesForLayer[mapServerUrl.url], layerList.layers[i].layerId) !== -1) {
                        isLegendCreated = true;
                        layerURL = mapServerUrl.url + '/' + layerList.layers[i].layerId;
                        this._layerCollection[layerURL] = layerList.layers[i];
                        layerName = this._getLayerTitle(layerURL, layerArray);
                        if (layerName) {
                            this._layerCollection[layerURL].layerName = layerName;
                        }
                    }
                }
            }
            this._addlegendListWidth();
            return isLegendCreated;
        },

        /**
        * get layer title from layerArray
        * @param {string} layerUrl
        * @param {array} layerArray
        * @memberOf widgets/legends/legends
        */
        _getLayerTitle: function (layerUrl, layerArray) {
            var i;
            for (i = 0; i < layerArray.length; i++) {
                if (layerArray[i].url === layerUrl) {
                    return layerArray[i].title;
                }
            }
        },
        /**
        * set legend container width
        * @memberOf widgets/legends/legends
        */
        _addlegendListWidth: function () {
            var total = 0, j;
            for (j = 0; j < this.legendListWidth.length; j++) {
                total += this.legendListWidth[j];
                this.widthLegendContentDiv = total;
            }
            if (total < this.divLegendContainer.offsetWidth) {
                domStyle.set(this.divLegendContent, "width", "auto");
            } else {
                domStyle.set(this.divLegendContent, "width", (total + 5) + "px");
            }
            this._resetSlideControls();
        },

        /**
        * add legend symbol in legend list
        * @memberOf widgets/legends/legends
        */
        _addLegendSymbol: function (legend, layerName) {
            var divLegendList, divLegendImage, divLegendLabel, legendWidth, width, height;
            if (legend) {
                divLegendList = domConstruct.create("div", { "class": "esriCTDivLegendList" }, this.divLegendContent);
                divLegendImage = domConstruct.create("div", { "class": "esriCTDivLegend" }, null);
                width = legend.width ? legend.width < 5 ? 5 : legend.width : 20;
                height = legend.height ? legend.height < 5 ? 5 : legend.height : 20;
                domConstruct.create("img", {
                    "src": "data:image/gif;base64," + legend.imageData,
                    "style": "width:" + width + "px; height:" + height + "px"
                }, divLegendImage);
                divLegendList.appendChild(divLegendImage);
                if (legend.label) {
                    divLegendLabel = domConstruct.create("div", { "class": "esriCTDivLegendLabel", "innerHTML": legend.label }, divLegendList);
                } else {
                    divLegendLabel = domConstruct.create("div", { "class": "esriCTDivLegendLabel", "innerHTML": layerName }, divLegendList);
                }
                legendWidth = divLegendLabel.offsetWidth + legend.width + 60;
                this.legendListWidth.push(legendWidth);
            }
        }
    });
});
