function barChartDirective(Data, $location){

    var margin = {top: 70, right: 10, bottom: 100, left: 50},
         margin2 = {top: 10, right: 10, bottom: 20, left: 50},
        width = 860 - margin.left - margin.right,
        height = 400 - margin.top - margin.bottom,
        height2 = 130 - margin2.top - margin2.bottom;

    var selectedIndex = 0;

    function loadTimeline(scope, data, el){

            var passed = data[0].values;
            var failed = data[1].values;
            var selectedIndex =
                Data.versionBuilds.indexOf(Data.selectedBuildObj);

            var rangeCursor = 0;
            var n = 2;
            var m = passed.length;
            var t = 30; // truncation value
            stack = d3.layout.stack();

            layers = function(pass, fail){
                return [
                    { "name": "passed",
                      "x" : 0,
                      "values": pass.map(function(d, i){
                         return {"x": i,
                                 "y": d[1],
                                 "y0": 0,
                                 "bno": d[0]}})
                    },
                    { "name": "failed",
                      "x" : 0,
                      "values": fail.map(function(d, i){
                         return {"x": i,
                                 "y": -1*d[1],
                                 "y0": 0,
                                 "bno": d[0]}})
                    }
                ]};

            yGroupMax = d3.max(passed, function(d) { return d[1]; });


            var x = d3.scale.ordinal()
                    .domain(passed.map(function(d){ return d[0]}))
                    .rangeRoundBands([0, width], .08),
                x2 = d3.scale.ordinal()
                    .domain(passed.map(function(d){ return d[0]}))
                    .rangeRoundBands([0, width], .08),
                y = d3.scale.linear()
                    .domain([0, yGroupMax])
                    .range([height, 0]),
                y2 = d3.scale.linear()
                    .domain([0, yGroupMax])
                    .range([height2, 0]);

            var barWidth = Math.floor(width/x2.domain().length);
            var colors = ["#3bc93b", "#de0000"];



            var svg = d3.select(el).append("svg")
                .attr("width", width + margin.left + margin.right)
                .attr("height", height + margin.top + margin.bottom);

            svg.append("defs").append("clipPath")
                .attr("id", "clip")
              .append("rect")
                .attr("width", width)
                .attr("height", width);

            var context = svg.append("g")
                .attr("class", "context")
                .attr("transform",
                    "translate(" + margin2.left + "," + margin2.top + ")");

            var focus = svg.append("g")
                .attr("class", "focus")
                .attr("transform",
                     "translate("+ margin.left +"," + margin.top + ")");


            var xTickerValues = function(pass){
                var tickerMod = 1;
                if(pass.length > 10){
                    tickerMod = Math.floor(m/10);
                }

                return pass.filter(function(d, i){
                          return (i%tickerMod == 0) }).map(function(d){
                                return d[0]});
            }
            var xAxis = d3.svg.axis()
                .scale(x)
                .tickValues(xTickerValues(passed))
                .tickSize(0)
                .tickPadding(6)
                .orient("bottom");

            var xAxis2 = d3.svg.axis()
                .scale(x2)
                .tickFormat("")
                .tickSize(0)
                .tickPadding(6)
                .orient("bottom");

            var yAxis = d3.svg.axis()
                .scale(y)
                .tickSize(-width, 0, 0)
                .tickPadding(6)
                .orient("left")
                .ticks(3);
                

            var area = d3.svg.area()
                .interpolate("monotone")
                .x(function(d) { return x(d.bno); })
                .y0(height)
                .y1(function(d) { return y(d.y); });


            var area2 = d3.svg.area()
                .interpolate("monotone")
                .x(function(d) { return x2(d.bno); })
                .y0(height2)
                .y1(function(d) { return y2(d.y); });

            var opaqueLevel = function(d){
                var selectedBno = 
                    Data.selectedBuildObj.Version.split("-")[1];
                if (selectedBno == d.bno){
                    return 1;
                }
                return 0.5; 
            };

            var layer = focus.selectAll(".layer")
                .data(layers(passed, failed))
              
            layer.enter().append("g")
                .attr("class", "layer")
                .style("fill", function(d, i) { return colors[i]; });


            var rect = layer.selectAll("rect")
                .data(function(d) {return d.values;})
              .enter().append("rect")
                .attr("x", function(d, i) {return x(d.bno)})
                .attr("y", function(d) { return y(d.y); })
                .style("opacity", opaqueLevel)
                .attr("width", x.rangeBand())
                .attr("height", function(d) {
                     return y(d.y0) - y(d.y0 + d.y); });

            // context layer with brush
            var brush = d3.svg.brush()
                .x(x2)
                .extent([width-width/4, width]) // upper 1/4th
                .on("brush", function(){
                    // convert brush extent from pixel space
                    var extents = brush.extent();
                    var lval = Math.floor(extents[0]/barWidth);
                    var rval = Math.floor(extents[1]/barWidth);
                    var nPass = passed.filter(function(d, i){
                                return((i>=lval) && (i<=rval))});
                    var nDom = nPass.map(function(d){ return d[0] });
                    if(nDom.length > 0){

                        // update focus domain
                        x.domain(nDom);

                        // update focus data
                        rect.data(function(d) {return d.values;})
                            .attr("x", function(d, i) {return x(d.bno)})
                            .attr("height", function(d,i){
                                if((i<lval) || (i>rval)){
                                    return 0;
                                } return y(d.y0) - y(d.y); })
                            .attr("width", x.rangeBand());

                        // redraw axis
                        xAxis.tickValues(xTickerValues(nPass));
                        focus.select(".x.axis").call(xAxis);
                    } 
                });

            var cxlayer = context.selectAll(".layer2")
                .data(layers(passed, failed))
              .enter().append("g")
                .attr("class", "layer2")
                .style("fill", function(d, i) { return colors[i]; });

            var cxrect = cxlayer.selectAll("rect")
                .data(function(d) {return d.values;})
              .enter().append("rect")
                .attr("x", function(d, i) {return x(d.bno)})
                .attr("y", function(d, i) {return y(d.y)/4})
                .style("opacity", opaqueLevel)
                .attr("width", x.rangeBand())
                .attr("height", function(d) {
                     return (y(d.y0) - y(d.y0 + d.y))/4; });

            var cxlayer = context.append("g")
              .attr("class", "x axis")
              .attr("transform", "translate(0," + margin2.top+ ")")
              .call(xAxis2);

            cxlayer.append("g")
              .attr("class", "x brush")
              .call(brush)
              .call(brush.event)
            .selectAll("rect")
              .attr("y", -50)
              .attr("height", height2-2);


            rect.on("click", function(event, i) {
                Data.selectedBuildObj = Data.versionBuilds[i];
                $location.search("build", Data.selectedBuildObj.Version);
                $location.search("excluded_platforms", null);
                $location.search("excluded_categories", null);
                Data.refreshSidebar = true;
                Data.refreshJobs = true;

                // set opacity
                rect.transition()
                    .delay(1)
                    .style("opacity", opaqueLevel);

                cxrect.transition()
                    .delay(1)
                    .style("opacity", opaqueLevel);
                scope.$apply();
            });


            focus.append("g")
                .attr("class", "x axis grid")
                .attr("transform", "translate(0,"+height+")")
                .call(xAxis);

            focus.append("g")
                .attr("class", "y axis grid")
                .attr("transform", "translate(10,0)")
                .call(yAxis);

        
    }

    function link(scope, element, attr){
        scope.$watch('data.timelineAbsData', function(data){
            if((data != undefined) && (data.length > 0)){
                d3.select(element[0]).select("svg").remove();
                loadTimeline(scope, data, element[0]);
            }
        }, true);
    }

    return {
        link: link,
        restrict: 'E',
        scope: false
    }
}

function pieChartDirective(){

    function link(scope, element, attr){
        var color = d3.scale.category10();
        var data = [10, 20, 30];
        var width = 150;
        var height = 150;
        var min = Math.min(width, height);
        var svg = d3.select(element[0]).append('svg');
        var pie = d3.layout.pie().sort(null);
        var arc = d3.svg.arc()
            .outerRadius(min / 2 * 0.9)
            .innerRadius(min / 2 * 0.5);

        svg.attr({width: width, height: height});
        var g = svg.append('g')
            .attr('transform', 'translate(' + width / 2 + ',' + height / 2 + ')');

        g.selectAll('path').data(pie(data))
            .enter().append('path')
            .style('stroke', 'white')
            .attr('d', arc)
            .attr('fill', function(d, i){ return color(i) });
    }

    return {
        link: link,
        restrict: 'E',
        scope: false,
    }
}


