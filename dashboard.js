d3.csv("Data/Mobs.csv").then(data => {

    // Clean incoming CSV text fields and coerce numeric columns
    const trim = v => v ? v.trim() : "";
    const num = v => +v || 0;
    data.forEach(d => {
        d.name = d.name ? d.name.trim() : "";
        d.behaviorTypes = d.behaviorTypes ? d.behaviorTypes.trim() : ""; 
        d.spawnBehavior = d.spawnBehavior ? d.spawnBehavior.trim() : "";   
        d.healthPoints = +d.healthPoints || 0;
        d.maxDamage = +d.maxDamage || 0;
        d.debutDate = d.debutDate ? d.debutDate.trim() : "";
        d.minecraftVersion = d.minecraftVersion ? d.minecraftVersion.trim() : "";
        d.reproductiveRequirement = d.reproductiveRequirement ? d.reproductiveRequirement.trim() : "";
    });


    // Build a three-level hierarchy: behavior type -> spawn behavior -> reproductive requirement
    const hierarchy = d3.group(
        data,
        d => d.behaviorTypes,
        d => d.spawnBehavior,
        d => d.reproductiveRequirement || "None"
    );


    // Convert grouped maps into a D3-compatible tree object
    function tree(name, g) {
        if (Array.isArray(g)) {
            return {
                name,
                children: g.map(d => ({ name: d.name, mob_data: d })).sort((a, b) => a.name.localeCompare(b.name))
            };
        }
        return {
            name,
            children: Array.from(g, ([key, val]) => tree(key, val)).sort((a, b) => a.name.localeCompare(b.name))
        };
    }


    // Compute tree layout and push leaf nodes outward based on max damage
    const root = d3.hierarchy(tree("behaviorTypes", hierarchy));
    const tree_width = 2000, tree_height = 2000;
    d3.tree().size([tree_height, tree_width - 1000]).separation(() => 4)(root);
    const y_scale = 20;
    root.descendants().forEach(d => {
        if (d.data.mob_data && d.parent) {
            d.y = Math.min(d.y + d.data.mob_data.maxDamage * y_scale, tree_width - 50);
        }
    });


    // Create the SVG canvas used for the hierarchy visualization
    const svg = d3.select("#tree").append("svg")
        .attr("width", tree_width)
        .attr("height", tree_height);


    // Map behavior classes to consistent colors across lines and glyphs
    function get_behavior_color(name) {
        if (name === "Peaceful") return "#00ff55ff";
        if (name === "Hostile") return "#ff0000ff";
        if (name === "Conditional") return "#7c7b7bff";
        return "#ff0000";
    }

    // Draw links between hierarchy nodes and color by top-level behavior branch
    svg.selectAll(".tree_line")
        .data(root.links())
        .join("path")
        .attr("class", "tree_line")
        .attr("d", d3.linkHorizontal().x(d => d.y).y(d => d.x))
        .attr("stroke", d => {
            let node = d.target;
            while (node.parent) {
                if (node.parent.depth === 0) return get_behavior_color(node.data.name);
                node = node.parent;
            }
            return get_behavior_color();
        })
        .style("stroke", d => {
            let node = d.target;
            while (node.parent) {
                if (node.parent.depth === 0) return get_behavior_color(node.data.name);
                node = node.parent;
            }
            return get_behavior_color();
        });


    const behavior_color = d3.scaleOrdinal()
        .domain(["Peaceful", "Hostile", "Conditional"])
        .range(["#00ff44", "#ff0000", "#888888"]);


    // Reuse existing tooltip element or create one if it is missing
    let tooltip = d3.select("#tooltip");
    if (tooltip.empty()) {
        tooltip = d3.select("body").append("div")
            .attr("id", "tooltip")
            .style("display", "none")
            .style("pointer-events", "none")
            .style("z-index", "1000")
            .style("padding", "8px 12px")
            .style("border-radius", "8px")
            .style("background", "#211717f2")
            .style("color", "#fff")
            .style("position", "absolute");
    }


    // Render a mob glyph: damage-encoded star plus health-encoded circle
    function glyph(selection, mob) {
        const hp = mob.healthPoints || 5;
        const damage = mob.maxDamage || 1;
        const star_spikes = 5;
        const star_outer = damage;
        const star_inner = star_outer * 0.5;

        // Generate an SVG path for a star centered at the origin
        function star(star_center_x, star_center_y, spikes, outer, inner) {
            let path = "";
            let rotation = Math.PI / 2 * 3;
            const spike_distance = Math.PI / spikes;
            for (let i = 0; i < spikes; i++) {
                const star_outer_x = star_center_x + Math.cos(rotation) * outer;
                const star_outer_y = star_center_y + Math.sin(rotation) * outer;
                rotation += spike_distance;
                const star_inner_x = star_center_x + Math.cos(rotation) * inner;
                const star_inner_y = star_center_y + Math.sin(rotation) * inner;
                rotation += spike_distance;
                path += (i === 0 ? `M${star_outer_x},${star_outer_y}` : ` L${star_outer_x},${star_outer_y}`) + ` L${star_inner_x},${star_inner_y}`;
            }
            return path + " Z";
        }
        selection.append("path")
            .attr("d", star(0, 0, star_spikes, star_outer, star_inner))
            .attr("class", "star-pulse")
            .attr("stroke", "#bfff00")
            .attr("stroke-width", 1.5)
            .attr("fill", "#bfff00")
            .attr("opacity", 0.9);
        selection.append("circle")
            .attr("r", Math.sqrt(hp) * 1.3)
            .attr("fill", behavior_color(mob.behaviorTypes))
            .attr("stroke", "#a1a1a1");
    }


    // Draw tree nodes, label them, and attach hover/click interactions
    const node = svg.selectAll(".node")
        .data(root.descendants())
        .join("g")
        .attr("class", "node")
        .attr("transform", d => `translate(${d.y},${d.x})`);

    node.each(function(d) {
        const g = d3.select(this);
        if (d.data.mob_data) glyph(g, d.data.mob_data);
        g.append("text")
            .attr("dx", 15)
            .attr("dy", 5)
            .text(d.data.name)
            .on("mouseover", () => {
                if (!d.data.mob_data) return;
                const mob_data_selected = d.data.mob_data;
                const border_color = get_behavior_color(mob_data_selected.behaviorTypes);
                tooltip.style("display", "block")
                    .style("border-color", border_color)
                    .html(`
                        ${mob_data_selected.name}<br>
                        Health Points: ${mob_data_selected.healthPoints}<br>
                        Max Damage: ${mob_data_selected.maxDamage}<br>
                        Reproductive Requirement: ${mob_data_selected.reproductiveRequirement || "None"}<br>
                        Debut: ${mob_data_selected.debutDate}<br>
                        Version: ${mob_data_selected.minecraftVersion}
                    `);
            })
            .on("mouseout", () => tooltip.style("display", "none"))
            .on("click", () => selectNode(d));
    });


    // Create scatter plot axes for health (x) and max damage (y)
    const scatter_width = 1000, scatter_height = 900, scatter_margin = 60;
    const svg2 = d3.select("#scatter").append("svg")
        .attr("width", scatter_width)
        .attr("height", scatter_height);
    const x = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.healthPoints) || 20])
        .range([scatter_margin, scatter_width - scatter_margin]);
    const y = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.maxDamage) || 10])
        .range([scatter_height - scatter_margin, scatter_margin]);
    svg2.append("g").attr("transform", `translate(0,${scatter_height - scatter_margin})`).call(d3.axisBottom(x));
    svg2.append("g").attr("transform", `translate(${scatter_margin},0)`).call(d3.axisLeft(y));
    svg2.append("text")
        .attr("class", "x label")
        .text("Health Points")
        .attr("font-size", "20px")
        .attr("fill", "white")
        .attr("text-anchor", "middle")
        .attr("x", scatter_width / 2)
        .attr("y", scatter_height - 15);
    svg2.append("text")
        .attr("class", "y label")
        .text("Max Damage")
        .attr("font-size", "20px")
        .attr("fill", "white")
        .attr("text-anchor", "middle")
        .attr("x", 20)
        .attr("y", scatter_height / 2)
        .attr("transform", `rotate(-90, 20, ${scatter_height / 2})`);


    // Toggle selected mobs and mirror selection in both tree and scatter views
    let selected_mobs = [];
    function selectNode(d) {
        if (!d.data.mob_data) return;
        const mob = d.data.mob_data;
        const idx = selected_mobs.findIndex(m => m.name === mob.name);
        if (idx >= 0) selected_mobs.splice(idx, 1);
        else selected_mobs.push(mob);
        svg2.selectAll(".scatterGlyph").remove();
        svg.selectAll(".selected").classed("selected", false);
        selected_mobs.forEach(scatter_mob => {
            let mob_node = root.descendants().find(n => n.data.mob_data && n.data.mob_data.name === scatter_mob.name);

            // Highlight the full lineage from selected mob up to the root
            while (mob_node && mob_node.parent) {
                svg.selectAll(".tree_line")
                    .filter(l => l.source === mob_node.parent && l.target === mob_node)
                    .classed("selected", true);
                mob_node = mob_node.parent;
            }
            const g = svg2.append("g")
                .attr("class", "scatterGlyph")
                .attr("transform", `translate(${x(scatter_mob.healthPoints)},${y(scatter_mob.maxDamage)})`);
            glyph(g, scatter_mob);
            g.on("mouseover", () => {
                const border_color = get_behavior_color(scatter_mob.behaviorTypes);
                tooltip.style("display", "block")
                    .style("border-color", border_color)
                    .html(`
                        ${scatter_mob.name}<br>
                        Health Points: ${scatter_mob.healthPoints}<br>
                        Max Damage: ${scatter_mob.maxDamage}<br>
                        Reproductive Requirement: ${scatter_mob.reproductiveRequirement || "None"}<br>
                        Debut: ${scatter_mob.debutDate}<br>
                        Version: ${scatter_mob.minecraftVersion}
                    `);
            })
            .on("mouseout", () => tooltip.style("display", "none"));
        });
    }


});
