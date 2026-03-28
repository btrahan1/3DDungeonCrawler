window.DungeonCrawler = {
    canvas: null,
    engine: null,
    scene: null,
    camera: null,
    player: null,
    ui: null,
    inputMap: {},
    entities: [],
    chests: [],
    dungeonSize: 30,
    gridSize: 2.5,

    init: async function (canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.engine = new BABYLON.Engine(this.canvas, true);
        this.scene = new BABYLON.Scene(this.engine);
        this.scene.clearColor = new BABYLON.Color4(0.02, 0.02, 0.04, 1);
        this.scene.collisionsEnabled = true;

        // --- Camera ---
        this.camera = new BABYLON.ArcRotateCamera("camera", -Math.PI / 2, Math.PI / 3, 15, BABYLON.Vector3.Zero(), this.scene);
        this.camera.attachControl(this.canvas, true);
        this.camera.lowerRadiusLimit = 5;
        this.camera.upperRadiusLimit = 40;
        this.camera.wheelPrecision = 50;

        // --- Lighting ---
        const hemiLight = new BABYLON.HemisphericLight("hemiLight", new BABYLON.Vector3(0, 1, 0), this.scene);
        hemiLight.intensity = 0.5;

        const dirLight = new BABYLON.DirectionalLight("dirLight", new BABYLON.Vector3(-1, -2, -1), this.scene);
        dirLight.position = new BABYLON.Vector3(20, 40, 20);
        dirLight.intensity = 1.0;

        const shadowGenerator = new BABYLON.ShadowGenerator(1024, dirLight);
        shadowGenerator.useBlurExponentialShadowMap = true;
        shadowGenerator.blurKernel = 32;

        // --- GUI ---
        this.ui = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("UI");
        this.initHUD();

        // --- Input ---
        this.scene.onKeyboardObservable.add((kbInfo) => {
            const key = kbInfo.event.key.toLowerCase();
            switch (kbInfo.type) {
                case BABYLON.KeyboardEventTypes.KEYDOWN:
                    this.inputMap[key] = true;
                    if (key === " ") this.handleCombat();
                    if (key === "e") this.handleInteractions();
                    break;
                case BABYLON.KeyboardEventTypes.KEYUP:
                    this.inputMap[key] = false;
                    break;
            }
        });

        // --- Build Dungeon ---
        const dungeonData = this.generateDungeon(this.dungeonSize, this.dungeonSize);
        this.renderDungeon(dungeonData.grid, shadowGenerator);

        // --- Load Player ---
        try {
            const response = await fetch('data/Player.json');
            const playerData = await response.json();
            this.player = await this.loadVoxelModel(playerData, shadowGenerator, {
                right: 'data/sword.json',
                left: 'data/shield.json'
            });
            this.player.health = 100;
            this.player.maxHealth = 100;
            this.player.position = new BABYLON.Vector3(
                dungeonData.rooms[0].x * this.gridSize,
                0.1,
                dungeonData.rooms[0].y * this.gridSize
            );
            this.camera.setTarget(this.player);
        } catch (e) {
            console.error("Failed to load player:", e);
        }

        // --- Spawn Entities ---
        for (let i = 1; i < dungeonData.rooms.length; i++) {
            const room = dungeonData.rooms[i];
            
            // Spawn NPC
            const isGoblin = Math.random() > 0.4;
            const npcType = isGoblin ? 'data/goblin.json' : 'data/orc.json';
            const weaponType = isGoblin ? 'data/axe.json' : 'data/mace.json';
            
            try {
                const res = await fetch(npcType);
                const data = await res.json();
                const npc = await this.loadVoxelModel(data, shadowGenerator, { right: weaponType });
                npc.position = new BABYLON.Vector3(
                    (room.x + room.w / 2) * this.gridSize,
                    0.1,
                    (room.y + room.h / 2) * this.gridSize
                );
                npc.rotation.y = Math.random() * Math.PI * 2;
                npc.health = isGoblin ? 30 : 60;
                npc.maxHealth = npc.health;
                npc.name = isGoblin ? "Goblin" : "Orc";
                this.entities.push(npc);
                this.createHealthBar(npc);
            } catch (e) { console.error("NPC Error:", e); }

            // Spawn Chest
            try {
                const chest = await this.loadProp('data/chest.json', shadowGenerator);
                chest.position = new BABYLON.Vector3(
                    (room.x + 1) * this.gridSize,
                    0,
                    (room.y + 1) * this.gridSize
                );
                chest.isChest = true;
                chest.isOpen = false;
                this.chests.push(chest);
            } catch (e) { console.error("Chest Error:", e); }
        }

        // --- Render Loop ---
        this.engine.runRenderLoop(() => {
            this.handlePlayerMovement();
            this.handleNPCMovement();
            this.updateAnimations();
            this.updateHUD();
            this.scene.render();
        });

        window.addEventListener("resize", () => this.engine.resize());
    },

    // --- HUD System ---
    initHUD: function () {
        const container = new BABYLON.GUI.StackPanel();
        container.width = "220px";
        container.height = "100px";
        container.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        container.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
        container.left = "20px";
        container.top = "-20px";
        this.ui.addControl(container);

        const healthLabel = new BABYLON.GUI.TextBlock();
        healthLabel.text = "WARRIOR VANGUARD";
        healthLabel.color = "white";
        healthLabel.height = "30px";
        healthLabel.fontSize = 16;
        healthLabel.textHorizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        container.addControl(healthLabel);

        this.healthBar = new BABYLON.GUI.Slider();
        this.healthBar.minimum = 0;
        this.healthBar.maximum = 100;
        this.healthBar.value = 100;
        this.healthBar.height = "20px";
        this.healthBar.width = "200px";
        this.healthBar.color = "#cc0000";
        this.healthBar.background = "#444";
        this.healthBar.borderColor = "black";
        this.healthBar.isThumbClamped = true;
        this.healthBar.displayThumb = false;
        container.addControl(this.healthBar);

        this.promptText = new BABYLON.GUI.TextBlock();
        this.promptText.text = "";
        this.promptText.color = "yellow";
        this.promptText.fontSize = 24;
        this.promptText.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_CENTER;
        this.ui.addControl(this.promptText);
    },

    createHealthBar: function(mesh) {
        const rect = new BABYLON.GUI.Rectangle();
        rect.width = "60px";
        rect.height = "10px";
        rect.cornerRadius = 5;
        rect.color = "black";
        rect.thickness = 1;
        rect.background = "#555";
        this.ui.addControl(rect);
        rect.linkWithMesh(mesh);
        rect.linkOffsetY = -100;

        const inner = new BABYLON.GUI.Rectangle();
        inner.width = "100%";
        inner.height = "100%";
        inner.cornerRadius = 5;
        inner.background = "red";
        inner.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        rect.addControl(inner);

        mesh.healthBarUI = inner;
        mesh.healthContainerUI = rect;
        rect.isVisible = false;
    },

    updateHUD: function () {
        if (this.player) {
            this.healthBar.value = this.player.health;
        }

        // Proximity for chests
        let nearChest = false;
        this.chests.forEach(c => {
            const dist = BABYLON.Vector3.Distance(this.player.position, c.position);
            if (dist < 2.0 && !c.isOpen) {
                this.promptText.text = "PRESS [E] TO OPEN CHEST";
                nearChest = true;
            }
        });
        if (!nearChest) this.promptText.text = "";
    },

    // --- Mechanics ---
    handleCombat: function () {
        if (!this.player || this.player.isSwinging) return;
        
        this.player.isSwinging = true;
        const arm = this.player.userData.armR;
        const startRot = arm.rotation.x;

        // Swing Animation
        const anim = new BABYLON.Animation("swing", "rotation.x", 60, BABYLON.Animation.ANIMATIONTYPE_FLOAT, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
        anim.setKeys([{ frame: 0, value: startRot }, { frame: 10, value: startRot + 1.5 }, { frame: 20, value: startRot }]);
        arm.animations = [anim];
        this.scene.beginAnimation(arm, 0, 20, false, 1, () => {
            this.player.isSwinging = false;
        });

        // Hit Detection
        setTimeout(() => {
            this.entities.forEach(npc => {
                const dist = BABYLON.Vector3.Distance(this.player.position, npc.position);
                const dir = npc.position.subtract(this.player.position).normalize();
                const dot = BABYLON.Vector3.Dot(this.player.forward, dir);

                if (dist < 3.0 && dot > 0.5) {
                    npc.health -= 15;
                    npc.healthContainerUI.isVisible = true;
                    npc.healthBarUI.width = (npc.health / npc.maxHealth * 100) + "%";
                    
                    // Knockback
                    npc.moveWithCollisions(dir.scale(0.5));
                    
                    // Visual feedback
                    this.showDamageText("-15", npc.position.clone());

                    if (npc.health <= 0) {
                        this.entities = this.entities.filter(e => e !== npc);
                        npc.healthContainerUI.dispose();
                        npc.dispose();
                    }
                }
            });
        }, 150);
    },

    handleInteractions: function () {
        this.chests.forEach(c => {
            const dist = BABYLON.Vector3.Distance(this.player.position, c.position);
            if (dist < 2.0 && !c.isOpen) {
                c.isOpen = true;
                this.showDamageText("LOOTED!", c.position.clone(), "gold");
                // Animate Lid
                const lid = c.getChildren().find(child => child.name.includes("lid") || (child.parent && child.name === "p" && child.position.y > 0.5));
                if (lid) {
                    const anim = new BABYLON.Animation("open", "rotation.x", 30, BABYLON.Animation.ANIMATIONTYPE_FLOAT, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
                    anim.setKeys([{ frame: 0, value: 0 }, { frame: 15, value: -Math.PI / 2 }]);
                    lid.animations = [anim];
                    this.scene.beginAnimation(lid, 0, 15, false);
                }
            }
        });
    },

    showDamageText: function (text, pos, color = "white") {
        const label = new BABYLON.GUI.TextBlock();
        label.text = text;
        label.color = color;
        label.fontSize = 20;
        this.ui.addControl(label);
        
        const proj = BABYLON.Vector3.Project(pos.add(new BABYLON.Vector3(0, 2, 0)), BABYLON.Matrix.Identity(), this.scene.getTransformMatrix(), this.camera.viewport.toGlobal(this.engine.getRenderWidth(), this.engine.getRenderHeight()));
        label.left = proj.x - this.engine.getRenderWidth() / 2;
        label.top = proj.y - this.engine.getRenderHeight() / 2;

        let alpha = 1.0;
        const interval = setInterval(() => {
            alpha -= 0.02;
            label.alpha = alpha;
            label.top -= 1;
            if (alpha <= 0) {
                clearInterval(interval);
                label.dispose();
            }
        }, 20);
    },

    // --- Core Methods ---
    generateDungeon: function (width, height) {
        const grid = Array(height).fill().map(() => Array(width).fill(1));
        const rooms = [];
        for (let i = 0; i < 10; i++) {
            const rw = Math.floor(Math.random() * 4) + 4, rh = Math.floor(Math.random() * 4) + 4;
            const rx = Math.floor(Math.random() * (width - rw - 2)) + 1, ry = Math.floor(Math.random() * (height - rh - 2)) + 1;
            let overlap = false;
            rooms.forEach(r => { if (rx < r.x + r.w && rx + rw > r.x && ry < r.y + r.h && ry + rh > r.y) overlap = true; });
            if (!overlap) {
                for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) grid[y][x] = 0;
                rooms.push({ x: rx, y: ry, w: rw, h: rh });
            }
        }
        for (let i = 0; i < rooms.length - 1; i++) this.carvePipes(grid, rooms[i], rooms[i + 1]);
        return { grid, rooms };
    },

    carvePipes: function (grid, r1, r2) {
        let x1 = Math.floor(r1.x + r1.w/2), y1 = Math.floor(r1.y + r1.h/2), x2 = Math.floor(r2.x + r2.w/2), y2 = Math.floor(r2.y + r2.h/2);
        for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) { grid[y1][x] = 0; if (y1+1 < grid.length) grid[y1+1][x] = 0; }
        for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) { grid[y][x2] = 0; if (x2+1 < grid[0].length) grid[y][x2+1] = 0; }
    },

    renderDungeon: function (grid, shadowGenerator) {
        const floorMat = new BABYLON.StandardMaterial("floorMat", this.scene);
        floorMat.diffuseColor = new BABYLON.Color3(0.2, 0.2, 0.25);
        const wallMat = new BABYLON.StandardMaterial("wallMat", this.scene);
        wallMat.diffuseColor = new BABYLON.Color3(0.4, 0.4, 0.45);
        wallMat.bumpTexture = new BABYLON.Texture("https://www.babylonjs-playground.com/textures/rockn.png", this.scene);
        for (let y = 0; y < grid.length; y++) {
            for (let x = 0; x < grid[0].length; x++) {
                const pos = new BABYLON.Vector3(x * this.gridSize, 0, y * this.gridSize);
                if (grid[y][x] === 0) {
                    const floor = BABYLON.MeshBuilder.CreatePlane("floor", { size: this.gridSize }, this.scene);
                    floor.rotation.x = Math.PI / 2; floor.position = pos; floor.material = floorMat; floor.checkCollisions = true; floor.receiveShadows = true;
                } else {
                    const wall = BABYLON.MeshBuilder.CreateBox("wall", { size: this.gridSize, height: 2.5 }, this.scene);
                    wall.position = pos.add(new BABYLON.Vector3(0, 1.25, 0)); wall.material = wallMat; wall.checkCollisions = true; shadowGenerator.addShadowCaster(wall);
                }
            }
        }
    },

    loadVoxelModel: async function (data, shadowGenerator, equipment = {}) {
        const root = BABYLON.MeshBuilder.CreateBox("root", { size: 0.1 }, this.scene);
        root.isVisible = false; root.checkCollisions = true; root.ellipsoid = new BABYLON.Vector3(0.4, 0.9, 0.4); root.ellipsoidOffset = new BABYLON.Vector3(0, 0.9, 0);
        const colors = data.ProceduralColors || { Skin: "#D2B48C", Shirt: "#71797E", Pants: "#3E2723" };
        const makeTex = (n, hx, w, h) => {
            if (!hx) return null; const res = 64; const dt = new BABYLON.DynamicTexture(n, res, this.scene, false);
            const ctx = dt.getContext(); const pxW = res / w, pxH = res / h;
            for (let i = 0; i < hx.length; i++) { ctx.fillStyle = hx[i]; ctx.fillRect((i % w) * pxW, Math.floor(i / w) * pxH, pxW, pxH); }
            dt.update(); dt.hasAlpha = false; dt.wrapU = dt.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE; return dt;
        };
        const texFace = makeTex("f", data.Textures.Face, 8, 8), texChest = makeTex("c", data.Textures.Chest, 8, 12), texArms = makeTex("a", data.Textures.Arms, 4, 12), texLegs = makeTex("l", data.Textures.Legs, 4, 13);
        const matS = new BABYLON.StandardMaterial("s", this.scene); matS.diffuseColor = BABYLON.Color3.FromHexString(colors.Skin);
        const matC = new BABYLON.StandardMaterial("c", this.scene); matC.diffuseTexture = texChest;
        const matL = new BABYLON.StandardMaterial("l", this.scene); matL.diffuseTexture = texLegs;
        const matA = new BABYLON.StandardMaterial("a", this.scene); matA.diffuseTexture = texArms;
        const faceMat = new BABYLON.MultiMaterial("fm", this.scene);
        faceMat.subMaterials = [new BABYLON.StandardMaterial("f", this.scene), matS, matS, matS, matS, matS];
        faceMat.subMaterials[0].diffuseTexture = texFace;
        const torso = BABYLON.MeshBuilder.CreateBox("torso", { width: 0.6, height: 0.8, depth: 0.3 }, this.scene);
        torso.parent = root; torso.position.y = 1.1; torso.material = matC; shadowGenerator.addShadowCaster(torso);
        const head = BABYLON.MeshBuilder.CreateBox("head", { size: 0.45 }, this.scene);
        head.parent = root; head.position.y = 1.75; head.material = faceMat; head.subMeshes = [];
        const vc = head.getTotalVertices();
        for(let i=0; i<6; i++) new BABYLON.SubMesh(i, 0, vc, i*6, 6, head);
        const cArm = (isL) => {
            const p = new BABYLON.TransformNode("ap", this.scene); p.parent = torso; p.position.set(isL ? 0.4 : -0.4, 0.3, 0);
            const a = BABYLON.MeshBuilder.CreateBox("arm", { width: 0.2, height: 0.7, depth: 0.2 }, this.scene);
            a.parent = p; a.position.y = -0.3; a.material = matA; shadowGenerator.addShadowCaster(a); return p;
        };
        const armL = cArm(true), armR = cArm(false);
        const cLeg = (isL) => {
            const p = new BABYLON.TransformNode("lp", this.scene); p.parent = root; p.position.set(isL ? 0.18 : -0.18, 0.7, 0);
            const l = BABYLON.MeshBuilder.CreateBox("leg", { width: 0.25, height: 0.7, depth: 0.25 }, this.scene);
            l.parent = p; l.position.y = -0.3; l.material = matL; shadowGenerator.addShadowCaster(l); return p;
        };
        const legL = cLeg(true), legR = cLeg(false);
        if (equipment.right) { const wp = await this.loadProp(equipment.right, shadowGenerator); if (wp) { wp.parent = armR; wp.position.y = -0.6; wp.rotation.x = Math.PI/2; } }
        if (equipment.left) { const wp = await this.loadProp(equipment.left, shadowGenerator); if (wp) { wp.parent = armL; wp.position.y = -0.4; wp.position.x = 0.2; wp.rotation.y = -Math.PI/2; } }
        root.userData = { armL, armR, legL, legR, ai: { target: null, idle: 0, lastPos: null, stuckCount: 0 } };
        return root;
    },

    loadProp: async function (url, shadowGenerator) {
        try {
            const response = await fetch(url); const data = await response.json();
            const group = new BABYLON.TransformNode("p_" + url, this.scene);
            const parts = data.Parts || data.parts;
            if (parts) {
                parts.forEach(part => {
                    let mesh; const shape = (part.Shape || part.shape || "Box").toLowerCase();
                    if (shape === "sphere") mesh = BABYLON.MeshBuilder.CreateSphere("p", { diameter: 1 }, this.scene);
                    else if (shape === "cylinder") mesh = BABYLON.MeshBuilder.CreateCylinder("p", { diameter: 1, height: 1 }, this.scene);
                    else mesh = BABYLON.MeshBuilder.CreateBox(part.Id || "p", { size: 1 }, this.scene);
                    mesh.parent = group;
                    const pos = part.Position || [0,0,0], rot = part.Rotation || [0,0,0], scale = part.Scale || [1,1,1];
                    mesh.position = new BABYLON.Vector3(pos[0], pos[1], pos[2]);
                    mesh.rotation = new BABYLON.Vector3(rot[0]*Math.PI/180, rot[1]*Math.PI/180, rot[2]*Math.PI/180);
                    mesh.scaling = new BABYLON.Vector3(scale[0], scale[1], scale[2]);
                    const mat = new BABYLON.StandardMaterial("pm", this.scene);
                    mat.diffuseColor = BABYLON.Color3.FromHexString(part.ColorHex || "#FFFFFF");
                    if ((part.Material || "").toLowerCase().includes("metal")) { mat.specularPower = 64; mat.specularColor = new BABYLON.Color3(0.5, 0.5, 0.5); }
                    else if ((part.Material || "").toLowerCase().includes("glow")) mat.emissiveColor = mat.diffuseColor;
                    mesh.material = mat; shadowGenerator.addShadowCaster(mesh);
                });
            }
            return group;
        } catch (e) { return null; }
    },

    handlePlayerMovement: function () {
        if (!this.player) return;
        const speed = 0.12, rotSpeed = 0.05; let moving = false;
        if (this.inputMap["w"]) { this.player.moveWithCollisions(this.player.forward.scale(speed)); moving = true; }
        if (this.inputMap["s"]) { this.player.moveWithCollisions(this.player.forward.scale(-speed * 0.5)); moving = true; }
        if (this.inputMap["a"]) this.player.rotation.y -= rotSpeed;
        if (this.inputMap["d"]) this.player.rotation.y += rotSpeed;
        this.player.isMoving = moving;
    },

    handleNPCMovement: function () {
        const speed = 0.05;
        this.entities.forEach(npc => {
            const ai = npc.userData.ai;
            if (!ai.target) {
                if (ai.idle > 0) { ai.idle--; npc.isMoving = false; }
                else { 
                    const angle = Math.random()*Math.PI*2, dist = Math.random()*5+2; 
                    ai.target = new BABYLON.Vector3(npc.position.x + Math.cos(angle)*dist, 0, npc.position.z + Math.sin(angle)*dist); 
                    ai.stuckCount = 0;
                    ai.lastPos = npc.position.clone();
                }
            } else {
                const diff = ai.target.subtract(npc.position);
                if (diff.length() < 0.5) { ai.target = null; ai.idle = Math.floor(Math.random()*100)+50; }
                else { 
                    // Stuck Detection
                    if (ai.lastPos && BABYLON.Vector3.Distance(npc.position, ai.lastPos) < 0.01) {
                        ai.stuckCount++;
                        if (ai.stuckCount > 30) { // Stuck for ~0.5 seconds
                            ai.target = null; // Pick new target next frame
                            ai.idle = 10;
                            return;
                        }
                    } else {
                        ai.stuckCount = 0;
                    }
                    ai.lastPos = npc.position.clone();

                    npc.rotation.y = BABYLON.Scalar.LerpAngle(npc.rotation.y, Math.atan2(diff.x, diff.z), 0.1); 
                    npc.moveWithCollisions(npc.forward.scale(speed)); 
                    npc.isMoving = true; 
                }
            }
        });
    },

    updateAnimations: function () {
        const now = Date.now(), all = [this.player, ...this.entities];
        all.forEach(ent => {
            if (!ent || !ent.userData) return;
            const ud = ent.userData;
            if (ent.isMoving) {
                const swing = Math.sin(now * 0.008 + (ent === this.player ? 0 : ent.uniqueId % 10)) * 0.5;
                ud.legL.rotation.x = swing; ud.legR.rotation.x = -swing;
                if (!ent.isSwinging) { ud.armL.rotation.x = -swing*0.8; ud.armR.rotation.x = swing*0.8; }
            } else {
                ud.legL.rotation.x *= 0.8; ud.legR.rotation.x *= 0.8;
                if (!ent.isSwinging) { ud.armL.rotation.x *= 0.8; ud.armR.rotation.x *= 0.8; }
            }
        });
    }
};
