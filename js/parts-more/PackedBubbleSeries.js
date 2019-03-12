/**
 * (c) 2010-2018 Grzegorz Blachlinski, Sebastian Bochan
 *
 * License: www.highcharts.com/license
 */

'use strict';

import H from '../parts/Globals.js';
import '../parts/Utilities.js';
import '../parts/Axis.js';
import '../parts/Color.js';
import '../parts/Point.js';
import '../parts/Series.js';
import '../modules/networkgraph/layouts.js';
import '../modules/networkgraph/draggable-nodes.js';


var seriesType = H.seriesType,
    Series = H.Series,
    Point = H.Point,
    defined = H.defined,
    pick = H.pick,
    addEvent = H.addEvent,
    Chart = H.Chart,
    color = H.Color,
    Reingold = H.layouts['reingold-fruchterman'],
    NetworkPoint = H.seriesTypes.bubble.prototype.pointClass;


H.networkgraphIntegrations.packedbubble = {
    repulsiveForceFunction: function (d, k, node, repNode) {
        return Math.min(d, (node.marker.radius + repNode.marker.radius) / 2);
    },
    barycenter: function () {
        var layout = this,
            gravitationalConstant = layout.options.gravitationalConstant,
            box = layout.box,
            nodes = layout.nodes,
            centerX,
            centerY;

        nodes.forEach(function (node) {
            if (layout.options.splitSeries && !node.isParentNode) {
                centerX = node.series.parentNode.plotX;
                centerY = node.series.parentNode.plotY;
            } else {
                centerX = box.width / 2;
                centerY = box.height / 2;
            }
            if (!node.fixedPosition) {
                node.plotX -= (node.plotX - centerX) *
                    gravitationalConstant /
                    (node.mass * Math.sqrt(nodes.length));

                node.plotY -= (node.plotY - centerY) *
                    gravitationalConstant /
                    (node.mass * Math.sqrt(nodes.length));
            }
        });
    },

    repulsive: function (node, force, distanceXY, repNode) {
        var factor = force * this.diffTemperature / node.mass / node.degree,
            x = distanceXY.x * factor,
            y = distanceXY.y * factor;

        if (!node.fixedPosition) {
            node.plotX += x;
            node.plotY += y;
        }
        if (!repNode.fixedPosition) {
            repNode.plotX -= x;
            repNode.plotY -= y;
        }
    },
    integrate: H.networkgraphIntegrations.verlet.integrate,
    getK: H.noop
};

H.layouts.packedbubble = H.extendClass(
    Reingold,
    {
        setCircularPositions: function () {
            var layout = this,
                box = layout.box,
                nodes = layout.nodes,
                nodesLength = nodes.length + 1,
                angle = 2 * Math.PI / nodesLength,
                centerX,
                centerY,
                radius = layout.options.initialPositionRadius;
            nodes.forEach(function (node, index) {
                if (
                    layout.options.splitSeries &&
                    !node.isParentNode
                ) {
                    centerX = node.series.parentNode.plotX;
                    centerY = node.series.parentNode.plotY;
                } else {
                    centerX = box.width / 2;
                    centerY = box.height / 2;
                }

                node.plotX = node.prevX = pick(
                    node.plotX,
                    centerX +
                    radius * Math.cos(node.index || index * angle)
                );

                node.plotY = node.prevY =
                    pick(
                        node.plotY,
                        centerY +
                        radius * Math.sin(node.index || index * angle)
                    );

                node.dispX = 0;
                node.dispY = 0;
            });
        },
        repulsiveForces: function () {
            var layout = this,
                force,
                distanceR,
                distanceXY,
                bubblePadding = layout.options.bubblePadding;

            layout.nodes.forEach(function (node) {
                node.degree = node.mass;
                node.neighbours = 0;
                layout.nodes.forEach(function (repNode) {
                    force = 0;
                    if (
                        // Node can not repulse itself:
                        node !== repNode &&
                        // Only close nodes affect each other:

                        // Not dragged:
                        !node.fixedPosition &&
                        (
                            layout.options.seriesInteraction ||
                            node.series === repNode.series
                        )
                    ) {
                        distanceXY = layout.getDistXY(node, repNode);
                        distanceR = (
                            layout.vectorLength(distanceXY) -
                            (
                                node.marker.radius +
                                repNode.marker.radius +
                                bubblePadding
                            )
                        );
                        // TODO padding configurable
                        if (distanceR < 0) {
                            node.degree += 0.01;
                            node.neighbours++;
                            force = layout.repulsiveForce(
                                -distanceR / Math.sqrt(node.neighbours),
                                layout.k,
                                node,
                                repNode
                            );
                        }

                        layout.force(
                            'repulsive',
                            node,
                            force * repNode.mass,
                            distanceXY,
                            repNode,
                            distanceR
                        );
                    }
                });
            });
        },
        applyLimitBox: function (node) {
            var layout = this,
                distanceXY,
                distanceR,
                factor = 0.01;

            // parentNodeLimit should be used together
            // with seriesInteraction: false
            if (
                layout.options.splitSeries &&
                !node.isParentNode &&
                layout.options.parentNodeLimit
            ) {
                distanceXY = layout.getDistXY(node, node.series.parentNode);
                distanceR = (
                    node.series.parentNodeRadius -
                    node.marker.radius -
                    layout.vectorLength(distanceXY)
                );
                if (distanceR < 0 && distanceR > -2 * node.marker.radius) {
                    node.plotX -= distanceXY.x * factor;
                    node.plotY -= distanceXY.y * factor;
                }
            }

            Reingold.prototype.applyLimitBox.apply(this, arguments);
        },
        isStable: function () {
            return Math.abs(
                this.systemTemperature -
                this.prevSystemTemperature
            ) < 0.00001 || this.temperature <= 0 ||
                this.systemTemperature / this.nodes.length < 0.01;
        }
    }
);


/**
 * A packed bubble series is a two dimensional series type, where each point
 * renders a value in X, Y position. Each point is drawn as a bubble
 * where the bubbles don't overlap with each other and the radius
 * of the bubble relates to the value.
 * Requires `highcharts-more.js`.
 *
 * @extends plotOptions.bubble
 * @excluding minSize,maxSize,connectNulls,keys,sizeByAbsoluteValue,
 * step,zMin,zMax,sizeBy,connectEnds
 * @product highcharts
 * @sample {highcharts} highcharts/demo/packed-bubble/
 *         Packed-bubble chart
 * @since 7.0.0
 * @excluding dragDrop, jitter, label, lineCap, pointInterval,
 * pointIntervalUnit, pointPlacement, pointStart, softThreshold, stacking, step,
 * threshold, xAxis, yAxis, zoneAxis, zones
 * @optionparent plotOptions.packedbubble
 */

seriesType('packedbubble', 'bubble',
    {
        /**
         * Minimum bubble size. Bubbles will automatically size between the
         * `minSize` and `maxSize` to reflect the `z` value of each bubble.
         * Can be either pixels (when no unit is given), or a percentage of
         * the smallest one of the plot width and height, divided by the square
         * root of total number of points.
         *
         * @type    {Number|String}
         * @sample  {highcharts} highcharts/plotoptions/bubble-size/ Bubble size
         * @since   3.0
         * @product highcharts highstock
         */
        minSize: '10%',
        /**
         * Maximum bubble size. Bubbles will automatically size between the
         * `minSize` and `maxSize` to reflect the `z` value of each bubble.
         * Can be either pixels (when no unit is given), or a percentage of
         * the smallest one of the plot width and height, divided by the square
         * root of total number of points.
         *
         * @type    {Number|String}
         * @sample  {highcharts} highcharts/plotoptions/bubble-size/
         *          Bubble size
         * @since   3.0
         * @product highcharts highstock
         */
        maxSize: '50%',
        sizeBy: 'area',
        zoneAxis: 'y',
        tooltip: {
            pointFormat: 'Value: {point.value}'
        },
        /**
        * Flag to determine if nodes are draggable or not.
        * @since 7.1.0
        */
        draggable: true,
        /**
         * An option is giving a possibility to choose between using simulation
         * for calculating bubble positions. These reflects in both animation
         * and final position of bubbles. Simulation is also adding
         * options to the series graph based on used layout.
         * in case of big data sets, with any performance issues, it is possible
         * to disable animation and pack bubble in simple circular way.
         *
         * @type    {Boolean}
         * @since   7.1.0
         * @product highcharts highstock
         * @default false
         */
        useSimulation: false,
        /**
         * If parentNode is created for splitted series, parentOption is used
         * for styling the parent nodes.
         *
         * @type    {Object}
         * @since   7.1.0
         * @product highcharts highstock
         */
        parentOptions: {
            fillColor: null,
            lineWidth: 1,
            lineColor: null,
            symbol: 'circle'
        },
        dataLabels: {
            formatter: function () {
                return this.point.value;
            },
            allowOverlap: true
        },
        /**
         * Options for layout algorithm when simulation is enabled. Inside there
         * is a possibility f.e. to change the speed, padding and initial
         * bubbles positions
         *
         * @extends plotOptions.networkgraph.layoutAlgorithm
         * @excluding approximation, attractiveForce, repulsiveForce, theta
         * @since 7.1.0
         */
        layoutAlgorithm: {
            /**
             * Initial layout algorithm for positioning nodes. Can be one of
             * built-in options ("circle", "random") or a function where
             * positions should be set on each node (`this.nodes`)
             *  as `node.plotX` and `node.plotY`.
             *
             * @sample      highcharts/series-networkgraph/initial-positions/
             *              Initial positions with callback
             * @since       7.1.0
             * @type        {String|Function}
             * @validvalue  ["circle", "random"]
             */
            initialPositions: 'circle',
            /**
             * When initialPositions are set to 'circle', initialPositionRadius
             * is a distance from the center of circle, in which bubbles are
             * created.
             *
             * @since       7.1.0
             * @type {Number}
             * @default 20
             */
            initialPositionRadius: 20,
            /**
             * The distance between two bubbles, when the algorithm starts to
             * treat two bubbles as overlapping. bubblePadding is also the
             * expected distance between all the bubbles on simulation end.
             *
             * @since       7.1.0
             * @type {Number}
             * @default 5
             */
            bubblePadding: 5,
            /**
             * Wheter bubbles should interact with their parentNode to keep them
             * inside or not.
             *
             * @since       7.1.0
             * @type {boolean}
             * @default false
             */
            parentNodeLimit: false,
            /**
             * Wheter series should interact with each other or not. When
             * parentNodeLimit is set to true, these option should be set to
             * false to avoid sticking points in wrong series parentNode.
             *
             * @since       7.1.0
             * @type {boolean}
             * @default true
             */
            seriesInteraction: true,
            /**
             * In case of splitted series, these option allows user to drag and
             * drop points between series, for changing point related series.
             *
             * @since       7.1.0
             * @type {boolean}
             * @default false
             */
            dragBetweenSeries: false,
            /**
             * Layout algorithm options for Parent Nodes
             *
             * @since       7.1.0
             * @extends plotOptions.networkgraph.layoutAlgorithm
             * @excluding approximation, attractiveForce, repulsiveForce, theta
             */
            parentNodeOptions: {
                enableSimulation: true,
                maxIterations: 400,
                gravitationalConstant: 0.03,
                maxSpeed: 50,
                initialPositionRadius: 100,
                seriesInteraction: true
            },
            enableSimulation: true,
            /**
             * Type of the algorithm used when positioning bubbles.
             *
             * @validvalue  ["packedbubble"]
             */
            type: 'packedbubble',
            /**
             * Integration type.
             * Integration determines how forces are applied
             * on particles. `packedbubble` integration is based on networkgraph
             * `Verlet` integration, where new position
             * is based on a previous posittion
             * without velocity:
             * `newPosition += previousPosition - newPosition`.
             *
             *
             *
             * @since       7.1.0
             * @sample      highcharts/series-networkgraph/forces/
             * @validvalue  ["packedbubble"]
             */
            integration: 'packedbubble',
            maxIterations: 1000,
            /**
             * Wheter to split series into individual groups or to mix all
             * series together.
             *
             *
             * @since       7.1.0
             * @default false
             */
            splitSeries: false,
            /**
             * Max speed that node can get in one iteration. In terms of
             * simulation, it's a maximum translation (in pixels) that node can
             * move (in both, x and y, dimensions). While `friction` is applied
             * on all nodes, max speed is applied only for nodes that move
             * very fast, for example small or disconnected ones.
             *
             * @see         [layoutAlgorithm.integration](#series.networkgraph.layoutAlgorithm.integration)
             * @see         [layoutAlgorithm.friction](#series.networkgraph.layoutAlgorithm.friction)
             * @since       7.1.0
             */
            maxSpeed: 5,
            gravitationalConstant: 0.01,
            friction: -0.981
        }
    }, {
        /**
         * An internal option used for allowing nodes dragging.
         */
        hasDraggableNodes: true,
        /**
         * Array of internal forces. Each force should be later defined in
         * integrations.js.
         */
        forces: ['barycenter', 'repulsive'],
        pointArrayMap: ['value'],
        pointValKey: 'value',
        isCartesian: false,
        axisTypes: [],
        /**
         * Create a single array of all points from all series
         *
         * @param {Array} Array of all series objects
         * @return {Array} Returns the array of all points.
         *
         */
        accumulateAllPoints: function (series) {

            var chart = series.chart,
                allDataPoints = [],
                i, j;

            for (i = 0; i < chart.series.length; i++) {

                series = chart.series[i];

                if (series.visible || !chart.options.chart.ignoreHiddenSeries) {

                    // add data to array only if series is visible
                    for (j = 0; j < series.yData.length; j++) {
                        allDataPoints.push([
                            null, null,
                            series.yData[j],
                            series.index,
                            j,
                            {
                                id: j,
                                marker: {
                                    radius: 0
                                }
                            }
                        ]);
                    }
                }
            }

            return allDataPoints;
        },
        init: function () {

            Series.prototype.init.apply(this, arguments);

            // When one series is modified, the others need to be recomputed
            addEvent(this, 'updatedData', function () {
                this.chart.series.forEach(function (s) {
                    if (s.type === this.type) {
                        s.isDirty = true;
                    }
                }, this);
            });

            return this;
        },
        render: function () {

            Series.prototype.render.apply(this, arguments);
            this.redrawHalo();

        },
        // Needed because of z-indexing issue if point is added in series.group
        setVisible: function () {
            var series = this;
            Series.prototype.setVisible.apply(series, arguments);
            if (series.parentNodeLayout && series.graph) {
                if (series.visible) {
                    series.graph.show();
                } else {
                    series.graph.hide();
                    series.parentNodeLayout.removeNode(series.parentNode);
                }
            } else if (series.layout) {
                if (series.visible) {
                    series.layout.addNodes(series.points);
                } else {
                    series.points.forEach(function (node) {
                        series.layout.removeNode(node);
                    });
                }
            }
        },
        /*
         * The function responsible for calculating the parent node radius
         * based on the total surface of iniside-bubbles and the group BBox
         */
        calculateParentRadius: function () {
            var series = this,
                bBox,
                parentPadding = 20,
                minParentRadius = 20;

            if (series.group) {
                bBox = series.group.element.getBBox();
            }

            series.parentNodeRadius =
                Math.min(
                    Math.max(
                        Math.sqrt(
                            2 * series.parentNodeMass / Math.PI
                        ) + parentPadding,
                        minParentRadius
                    ),
                    bBox ?
                        Math.max(
                            Math.sqrt(
                                Math.pow(bBox.width, 2) +
                                Math.pow(bBox.height, 2)
                            ) / 2 + parentPadding,
                            minParentRadius
                        ) :
                        Math.sqrt(
                            2 * series.parentNodeMass / Math.PI
                        ) + parentPadding,
                );

            if (series.parentNode) {
                series.parentNode.marker.radius = series.parentNodeRadius;
            }
        },
        // Create Background/Parent Nodes for splitted series.
        drawGraph: function () {

            // if the series is not using layout, don't add parent nodes
            if (!this.layout || !this.layout.options.splitSeries) {
                return;
            }

            var series = this,
                chart = series.chart,
                parentAttribs = {},
                userParentOptions = this.options.parentOptions,
                parentOptions = {
                    fill: userParentOptions.fillColor ||
                        color(series.color).brighten(0.4).get(),
                    stroke: userParentOptions.lineColor || series.color,
                    'stroke-width': userParentOptions.lineWidth
                };

            this.calculateParentRadius();

            parentAttribs = H.merge({
                x: series.parentNode.plotX -
                        series.parentNodeRadius + chart.plotLeft,
                y: series.parentNode.plotY -
                        series.parentNodeRadius + chart.plotTop,
                width: series.parentNodeRadius * 2,
                height: series.parentNodeRadius * 2
            }, parentOptions);


            if (!series.graph) {
                series.graph = chart.renderer.symbol(parentOptions.symbol)
                    .attr(parentAttribs)
                    .add();
            } else {
                series.graph.attr(parentAttribs);
            }
        },
        /*
         * Creating parent nodes for splitted series, in which all the bubbles
         * are rendered.
         */
        createParentNodes: function () {
            var series = this,
                chart = series.chart,
                parentNodeLayout = series.parentNodeLayout,
                nodeAdded;

            series.parentNodeMass = 0;

            series.points.forEach(function (p) {
                series.parentNodeMass += Math.PI * Math.pow(p.marker.radius, 2);
            });

            this.calculateParentRadius();
            parentNodeLayout.nodes.forEach(function (node) {
                if (node.seriesIndex === series.index) {
                    nodeAdded = true;
                }
            });
            parentNodeLayout.setArea(0, 0, chart.plotWidth, chart.plotHeight);

            if (!nodeAdded) {
                var parentNode = (
                    new NetworkPoint()
                ).init(
                    this,
                    {
                        mass: series.parentNodeRadius / 2,
                        marker: {
                            radius: series.parentNodeRadius
                        },
                        degree: series.parentNodeRadius,
                        isParentNode: true,
                        seriesIndex: series.index
                    }
                );
                if (series.parentNode) {
                    parentNode.plotX = series.parentNode.plotX;
                    parentNode.plotY = series.parentNode.plotY;
                }
                series.parentNode = parentNode;
                parentNodeLayout.addSeries(series);
                parentNodeLayout.addNodes([parentNode]);
            }
        },
        /*
         * Function responsible for adding series layout, used for parent nodes.
         */
        addSeriesLayout: function () {
            var series = this,
                layoutOptions = series.options.layoutAlgorithm,
                graphLayoutsStorage = series.chart.graphLayoutsStorage,
                graphLayoutsLookup = series.chart.graphLayoutsLookup,
                parentNodeOptions = layoutOptions.parentNodeOptions,
                parentNodeLayout;

            parentNodeLayout = graphLayoutsStorage[
                layoutOptions.type + '-series'
            ];

            if (!parentNodeLayout) {
                graphLayoutsStorage[layoutOptions.type + '-series'] =
                parentNodeLayout =
                    new H.layouts[layoutOptions.type]();

                parentNodeLayout.init(
                    H.merge(layoutOptions, parentNodeOptions)
                );

                graphLayoutsLookup.splice(
                    parentNodeLayout.index, 0, parentNodeLayout
                );
            }
            series.parentNodeLayout = parentNodeLayout;
            this.createParentNodes();
        },
        /*
         * Adding the basic layout to series points.
         */
        addLayout: function () {
            var series = this,
                layoutOptions = series.options.layoutAlgorithm,
                graphLayoutsStorage = series.chart.graphLayoutsStorage,
                graphLayoutsLookup = series.chart.graphLayoutsLookup,
                chartOptions = series.chart.options.chart,
                layout;

            if (!graphLayoutsStorage) {
                series.chart.graphLayoutsStorage = graphLayoutsStorage = {};
                series.chart.graphLayoutsLookup = graphLayoutsLookup = [];
            }

            layout = graphLayoutsStorage[layoutOptions.type];

            if (!layout) {
                layoutOptions.enableSimulation =
                    !defined(chartOptions.forExport) ?
                        layoutOptions.enableSimulation :
                        !chartOptions.forExport;

                graphLayoutsStorage[layoutOptions.type] = layout =
                    new H.layouts[layoutOptions.type]();

                layout.init(layoutOptions);
                graphLayoutsLookup.splice(layout.index, 0, layout);

            }

            series.layout = layout;

            series.points.forEach(function (node) {
                node.mass = 2;
                node.degree = 1;
                node.collisionNmb = 1;
            });

            layout.setArea(
                0, 0, series.chart.plotWidth, series.chart.plotHeight
            );
            layout.addSeries(series);
            layout.addNodes(series.points);
        },
        /*
         * Function responsible for adding all the layouts to the chart.
         */
        deferLayout: function () {
            // TODO split layouts to independent methods
            var series = this,
                layoutOptions = series.options.layoutAlgorithm;

            if (!series.visible) {
                return;
            }
            // layout is using nodes for position calculation
            series.addLayout();

            if (layoutOptions.splitSeries) {
                series.addSeriesLayout();
            }
        },
        /**
         * Extend the base translate method to handle bubble size,
         * and correct positioning them
         */
        translate: function () {

            var series = this,
                chart = series.chart,
                data = series.data,
                index = series.index,
                point,
                radius,
                positions,
                i,
                useSimulation = series.options.useSimulation;

            this.processedXData = this.xData;
            this.generatePoints();

            // merged data is an array with all of the data from all series
            if (!defined(chart.allDataPoints)) {
                chart.allDataPoints = series.accumulateAllPoints(series);
                // calculate radius for all added data
                series.getPointRadius();
            }

            // after getting initial radius, calculate bubble positions

            if (useSimulation) {
                positions = chart.allDataPoints;
            } else {
                positions = this.placeBubbles(chart.allDataPoints);
                series.options.draggable = false;
            }

            // Set the shape and arguments to be picked up in drawPoints
            for (i = 0; i < positions.length; i++) {

                if (positions[i][3] === index) {

                    // update the series points with the val from positions
                    // array
                    point = data[positions[i][4]];
                    radius = positions[i][2];

                    if (!useSimulation) {
                        point.plotX = positions[i][0] - chart.plotLeft +
                          chart.diffX;
                        point.plotY = positions[i][1] - chart.plotTop +
                          chart.diffY;
                    }
                    point.marker = H.extend(point.marker, {
                        radius: radius,
                        width: 2 * radius,
                        height: 2 * radius
                    });
                }
            }

            if (useSimulation) {
                this.deferLayout();
            }
        },
        /**
         * Check if two bubbles overlaps.
         * @param {Array} first bubble
         * @param {Array} second bubble
         *
         * @return {Boolean} overlap or not
         *
         */
        checkOverlap: function (bubble1, bubble2) {
            var diffX = bubble1[0] - bubble2[0], // diff of X center values
                diffY = bubble1[1] - bubble2[1], // diff of Y center values
                sumRad = bubble1[2] + bubble2[2]; // sum of bubble radius

            return (
                Math.sqrt(diffX * diffX + diffY * diffY) -
                Math.abs(sumRad)
            ) < -0.001;
        },
        /* Function that is adding one bubble based on positions and sizes
         * of two other bubbles, lastBubble is the last added bubble,
         * newOrigin is the bubble for positioning new bubbles.
         * nextBubble is the curently added bubble for which we are
         * calculating positions
         *
         * @param {Array} The closest last bubble
         * @param {Array} New bubble
         * @param {Array} The closest next bubble
         *
         * @return {Array} Bubble with correct positions
         *
         */
        positionBubble: function (lastBubble, newOrigin, nextBubble) {
            var sqrt = Math.sqrt,
                asin = Math.asin,
                acos = Math.acos,
                pow = Math.pow,
                abs = Math.abs,
                distance = sqrt( // dist between lastBubble and newOrigin
                    pow((lastBubble[0] - newOrigin[0]), 2) +
                    pow((lastBubble[1] - newOrigin[1]), 2)
                ),
                alfa = acos(
                    // from cosinus theorem: alfa is an angle used for
                    // calculating correct position
                    (
                        pow(distance, 2) +
                        pow(nextBubble[2] + newOrigin[2], 2) -
                        pow(nextBubble[2] + lastBubble[2], 2)
                    ) / (2 * (nextBubble[2] + newOrigin[2]) * distance)
                ),

                beta = asin( // from sinus theorem.
                    abs(lastBubble[0] - newOrigin[0]) /
                    distance
                ),
                // providing helping variables, related to angle between
                // lastBubble and newOrigin
                gamma = (lastBubble[1] - newOrigin[1]) < 0 ? 0 : Math.PI,
                // if new origin y is smaller than last bubble y value
                // (2 and 3 quarter),
                // add Math.PI to final angle

                delta = (lastBubble[0] - newOrigin[0]) *
                (lastBubble[1] - newOrigin[1]) < 0 ?
                    1 : -1, // (1st and 3rd quarter)
                finalAngle = gamma + alfa + beta * delta,
                cosA = Math.cos(finalAngle),
                sinA = Math.sin(finalAngle),
                posX = newOrigin[0] + (newOrigin[2] + nextBubble[2]) * sinA,
                // center of new origin + (radius1 + radius2) * sinus A
                posY = newOrigin[1] - (newOrigin[2] + nextBubble[2]) * cosA;
            return [
                posX,
                posY,
                nextBubble[2],
                nextBubble[3],
                nextBubble[4]
            ]; // the same as described before
        },
        /**
         * This is the main function responsible
         * for positioning all of the bubbles
         * allDataPoints - bubble array, in format [pixel x value,
         * pixel y value, radius,
         * related series index, related point index]
         *
         * @param {Array} All points from all series
         *
         * @return {Array} Positions of all bubbles
         *
         */
        placeBubbles: function (allDataPoints) {

            var series = this,
                checkOverlap = series.checkOverlap,
                positionBubble = series.positionBubble,
                bubblePos = [],
                stage = 1,
                j = 0,
                k = 0,
                calculatedBubble,
                sortedArr,
                arr = [],
                i;

            // sort all points
            sortedArr = allDataPoints.sort(function (a, b) {
                return b[2] - a[2];
            });

            if (sortedArr.length === 1) {
                // if length is 1,return only one bubble
                arr = [
                    0, 0,
                    sortedArr[0][0],
                    sortedArr[0][1],
                    sortedArr[0][2]
                ];
            } else if (sortedArr.length) {

                // create first bubble in the middle of the chart
                bubblePos.push([
                    [
                        0, // starting in 0,0 coordinates
                        0,
                        sortedArr[0][2], // radius
                        sortedArr[0][3], // series index
                        sortedArr[0][4]
                    ] // point index
                ]); // 0 level bubble

                bubblePos.push([
                    [
                        0,
                        0 - sortedArr[1][2] - sortedArr[0][2],
                        // move bubble above first one
                        sortedArr[1][2],
                        sortedArr[1][3],
                        sortedArr[1][4]
                    ]
                ]); // 1 level 1st bubble

                // first two already positioned so starting from 2
                for (i = 2; i < sortedArr.length; i++) {
                    sortedArr[i][2] = sortedArr[i][2] || 1;
                    // in case if radius is calculated as 0.
                    calculatedBubble = positionBubble(
                        bubblePos[stage][j],
                        bubblePos[stage - 1][k],
                        sortedArr[i]
                    ); // calculate initial bubble position

                    if (checkOverlap(calculatedBubble, bubblePos[stage][0])) {
                        /* if new bubble is overlapping with first bubble
                         * in current level (stage)
                         */

                        bubblePos.push([]);
                        k = 0;
                        /* reset index of bubble, used for
                         * positioning the bubbles
                         * around it, we are starting from first bubble in next
                         * stage because we are changing level to higher
                         */
                        bubblePos[stage + 1].push(
                            positionBubble(
                                bubblePos[stage][j],
                                bubblePos[stage][0],
                                sortedArr[i]
                            )
                        );
                        // (last added bubble, 1. from curr stage, new bubble)
                        stage++; // the new level is created, above current one
                        j = 0; // set the index of bubble in current level to 0
                    } else if (
                        stage > 1 && bubblePos[stage - 1][k + 1] &&
                        checkOverlap(
                            calculatedBubble, bubblePos[stage - 1][k + 1]
                        )
                    ) {
                        /* if new bubble is overlapping with one of the previous
                         * stage bubbles, it means that - bubble, used for
                         * positioning the bubbles around it has changed
                         * so we need to recalculate it
                         */
                        k++;
                        bubblePos[stage].push(
                            positionBubble(
                                bubblePos[stage][j],
                                bubblePos[stage - 1][k],
                                sortedArr[i]
                            )
                        );
                        // (last added bubble, prev stage bubble, new bubble)
                        j++;
                    } else { // simply add calculated bubble
                        j++;
                        bubblePos[stage].push(calculatedBubble);
                    }
                }
                series.chart.stages = bubblePos;
                // it may not be necessary but adding it just in case -
                // it is containing all of the bubble levels

                series.chart.rawPositions = [].concat.apply([], bubblePos);
                // bubble positions merged into one array

                series.resizeRadius();
                arr = series.chart.rawPositions;

            }
            return arr;
        },
        /**
         * The function responsible for resizing the bubble radius.
         * In shortcut: it is taking the initially
         * calculated positions of bubbles. Then it is calculating the min max
         * of both dimensions, creating something in shape of bBox.
         * The comparison of bBox and the size of plotArea
         * (later it may be also the size set by customer) is giving the
         * value how to recalculate the radius so it will match the size
         */
        resizeRadius: function () {

            var chart = this.chart,
                positions = chart.rawPositions,
                min = Math.min,
                max = Math.max,
                plotLeft = chart.plotLeft,
                plotTop = chart.plotTop,
                chartHeight = chart.plotHeight,
                chartWidth = chart.plotWidth,
                minX, maxX, minY, maxY,
                radius,
                bBox,
                spaceRatio,
                smallerDimension,
                i;

            minX = minY = Number.POSITIVE_INFINITY; // set initial values
            maxX = maxY = Number.NEGATIVE_INFINITY;

            for (i = 0; i < positions.length; i++) {
                radius = positions[i][2];
                minX = min(minX, positions[i][0] - radius);
                // (x center-radius) is the min x value used by specific bubble
                maxX = max(maxX, positions[i][0] + radius);
                minY = min(minY, positions[i][1] - radius);
                maxY = max(maxY, positions[i][1] + radius);
            }

            bBox = [maxX - minX, maxY - minY];
            spaceRatio = [
                (chartWidth - plotLeft) / bBox[0],
                (chartHeight - plotTop) / bBox[1]
            ];

            smallerDimension = min.apply([], spaceRatio);

            if (Math.abs(smallerDimension - 1) > 1e-10) {
                // if bBox is considered not the same width as possible size
                for (i = 0; i < positions.length; i++) {
                    positions[i][2] *= smallerDimension;
                }
                this.placeBubbles(positions);
            } else {
                /** if no radius recalculation is needed, we need to position
                 * the whole bubbles in center of chart plotarea
                 * for this, we are adding two parameters,
                 * diffY and diffX, that are related to differences
                 * between the initial center and the bounding box
                 */
                chart.diffY = chartHeight / 2 +
                    plotTop - minY - (maxY - minY) / 2;
                chart.diffX = chartWidth / 2 +
                    plotLeft - minX - (maxX - minX) / 2;
            }
        },
        /**
         * Calculate min and max bubble value for radius calculation.
         */
        calculateZExtremes: function () {
            var series = this,
                chart = series.chart,
                zMin = this.options.zMin,
                zMax = this.options.zMax,
                valMin = series.yData[0],
                valMax = series.yData[0];
            chart.series.forEach(function (s) {
                valMax = Math.max(valMax, Math.max.apply(this, s.yData));
                valMin = Math.min(valMin, Math.min.apply(this, s.yData));
            });

            zMin = zMin || valMin;
            zMax = zMax || valMax;
            return [zMin, zMax];
        },
        /**
         * Calculate radius of bubbles in series.
         */
        getPointRadius: function () { // bubbles array

            var series = this,
                chart = series.chart,
                plotWidth = chart.plotWidth,
                plotHeight = chart.plotHeight,
                seriesOptions = series.options,
                useSimulation = seriesOptions.useSimulation,
                smallestSize = Math.min(plotWidth, plotHeight),
                extremes = {},
                radii = [],
                allDataPoints = chart.allDataPoints,
                minSize,
                maxSize,
                value,
                radius, zExtremes;
            ['minSize', 'maxSize'].forEach(function (prop) {
                var length = parseInt(seriesOptions[prop], 10),
                    isPercent = /%$/.test(seriesOptions[prop]);

                extremes[prop] = isPercent ?
                    smallestSize * length / 100 :
                    length * Math.sqrt(allDataPoints.length);
            });

            chart.minRadius = minSize = extremes.minSize /
                Math.sqrt(allDataPoints.length);
            chart.maxRadius = maxSize = extremes.maxSize /
                Math.sqrt(allDataPoints.length);

            zExtremes = useSimulation ?
                this.calculateZExtremes() :
                [minSize, maxSize];

            (allDataPoints || []).forEach(function (point, i) {

                value = useSimulation ?
                    Math.max(Math.min(point[2], zExtremes[1]), zExtremes[0]) :
                    point[2];

                radius = series.getRadius(
                    zExtremes[0],
                    zExtremes[1],
                    minSize,
                    maxSize,
                    value
                );
                if (radius === 0) {
                    radius = null;
                }
                allDataPoints[i][2] = radius;
                radii.push(radius);
            });
            this.radii = radii;
        },
        // Draggable mode:
        /**
         * Redraw halo on mousemove during the drag&drop action.
         *
         * @param {Highcharts.Point} point The point that should show halo.
         */
        redrawHalo: function (point) {
            if (point && this.halo) {
                this.halo.attr({
                    d: point.haloPath(
                        this.options.states.hover.halo.size
                    )
                });
            }
        },
        /**
         * Mouse down action, initializing drag&drop mode.
         *
         * @param {global.Event} event Browser event, before normalization.
         * @param {Highcharts.Point} point The point that event occured.
         */
        onMouseDown: function (point, event) {
            var normalizedEvent = this.chart.pointer.normalize(event);

            point.fixedPosition = {
                chartX: normalizedEvent.chartX,
                chartY: normalizedEvent.chartY,
                plotX: point.plotX,
                plotY: point.plotY
            };

            point.inDragMode = true;
        },
        /**
         * Mouse move action during drag&drop.
         *
         * @param {global.Event} event Browser event, before normalization.
         * @param {Highcharts.Point} point The point that event occured.
         */
        onMouseMove: function (point, event) {
            if (point.fixedPosition && point.inDragMode) {
                var series = this,
                    chart = series.chart,
                    normalizedEvent = chart.pointer.normalize(event),
                    diffX = point.fixedPosition.chartX - normalizedEvent.chartX,
                    diffY = point.fixedPosition.chartY - normalizedEvent.chartY,
                    newPlotX,
                    newPlotY;

                // At least 5px to apply change (avoids simple click):
                if (Math.abs(diffX) > 5 || Math.abs(diffY) > 5) {
                    newPlotX = point.fixedPosition.plotX - diffX;
                    newPlotY = point.fixedPosition.plotY - diffY;

                    if (chart.isInsidePlot(newPlotX, newPlotY)) {
                        point.plotX = newPlotX;
                        point.plotY = newPlotY;

                        series.redrawHalo();

                        if (!series.layout.simulation) {
                            // Start new simulation:
                            if (!series.layout.enableSimulation) {
                                // Run only one iteration to speed things up:
                                series.layout.setMaxIterations(1);
                            }
                            // When dragging nodes, we don't need to calculate
                            // initial positions and rendering nodes:
                            series.layout.setInitialRendering(false);
                            series.layout.run();
                            // Restore defaults:
                            series.layout.setInitialRendering(true);
                        } else {
                            // Extend current simulation:
                            series.layout.resetSimulation();
                        }
                    }
                }
            }
        },
        /**
         * Mouse up action, finalizing drag&drop.
         *
         * @param {Highcharts.Point} point The point that event occured.
         */
        onMouseUp: function (point) {
            if (point.fixedPosition && !point.removed) {
                var distanceXY,
                    distanceR,
                    layout = this.layout,
                    parentNodeLayout = this.parentNodeLayout;

                if (parentNodeLayout && layout.options.dragBetweenSeries) {
                    parentNodeLayout.nodes.forEach(function (node) {
                        if (
                            point && point.marker &&
                            node !== point.series.parentNode
                        ) {
                            distanceXY = layout.getDistXY(point, node);
                            distanceR = (
                                layout.vectorLength(distanceXY) -
                                node.marker.radius -
                                point.marker.radius
                            );
                            if (distanceR < 0) {
                                node.series.addPoint(H.merge(point.options, {
                                    plotX: point.plotX,
                                    plotY: point.plotY
                                }), false);
                                layout.removeNode(point);
                                point.remove();
                            }
                        }
                    });
                }
                layout.run();
                point.inDragMode = false;
                if (!this.options.fixedDraggable) {
                    delete point.fixedPosition;
                }
            }
        },
        destroy: function () {
            if (this.parentNode) {
                this.parentNodeLayout.removeNode(this.parentNode);
            }
            H.Series.prototype.destroy.apply(this, arguments);
        },
        alignDataLabel: H.Series.prototype.alignDataLabel
    }, {
        /**
         * Destroy point.
         * Then remove point from the layout.
         *
         * @return {undefined}
         */
        destroy: function () {
            if (this.series.layout) {
                this.series.layout.removeNode(this);
            }
            return Point.prototype.destroy.apply(this, arguments);
        }
    });

// Remove accumulated data points to redistribute all of them again
// (i.e after hiding series by legend)

addEvent(Chart, 'beforeRedraw', function () {
    if (this.allDataPoints) {
        delete this.allDataPoints;
    }
});

/**
 * A `packedbubble` series. If the [type](#series.packedbubble.type) option is
 * not specified, it is inherited from [chart.type](#chart.type).
 *
 * @type      {Object}
 * @extends   series,plotOptions.packedbubble
 * @excluding dataParser,dataURL,stack
 * @product   highcharts highstock
 * @apioption series.packedbubble
 */

/**
 * An array of data points for the series. For the `packedbubble` series type,
 * points can be given in the following ways:
 *
 * 1.  An array of `values`.
 *
 *  ```js
 *     data: [5, 1, 20]
 *  ```
 *
 * 2.  An array of objects with named values. The objects are point
 * configuration objects as seen below. If the total number of data points
 * exceeds the series' [turboThreshold](#series.packedbubble.turboThreshold),
 * this option is not available.
 *
 *  ```js
 *     data: [{
 *         value: 1,
 *         name: "Point2",
 *         color: "#00FF00"
 *     }, {
 *         value: 5,
 *         name: "Point1",
 *         color: "#FF00FF"
 *     }]
 *  ```
 *
 * @type      {Array<Object|Array>}
 * @extends   series.line.data
 * @excluding marker
 * @sample    {highcharts} highcharts/series/data-array-of-objects/
 *            Config objects
 * @product   highcharts
 * @apioption series.packedbubble.data
 */

/**
 * @excluding enabled,enabledThreshold,height,radius,width
 * @apioption series.packedbubble.marker
 */
