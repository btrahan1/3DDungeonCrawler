window.DungeonCrawler = {
    canvas: null,
    engine: null,
    scene: null,
    camera: null,
    player: null,
    inputMap: {},
    entities: [],
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

        // --- Lighting (Well Lit) ---
        const hemiLight = new BABYLON.HemisphericLight("hemiLight", new BABYLON.Vector3(0, 1, 0), this.scene);
        hemiLight.intensity = 0.5;

        const dirLight = new BABYLON.DirectionalLight("dirLight", new BABYLON.Vector3(-1, -2, -1), this.scene);
        dirLight.position = new BABYLON.Vector3(20, 40, 20);
        dirLight.intensity = 1.0;

        const shadowGenerator = new BABYLON.ShadowGenerator(1024, dirLight);
        shadowGenerator.useBlurExponentialShadowMap = true;
        shadowGenerator.blurKernel = 32;

        // --- Input ---
        this.scene.onKeyboardObservable.add((kbInfo) => {
            switch (kbInfo.type) {
                case BABYLON.KeyboardEventTypes.KEYDOWN:
                    this.inputMap[kbInfo.event.key.toLowerCase()] = true;
                    break;
                case BABYLON.KeyboardEventTypes.KEYUP:
                    this.inputMap[kbInfo.event.key.toLowerCase()] = false;
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
            this.player.position = new BABYLON.Vector3(
                dungeonData.rooms[0].x * this.gridSize,
                0,
                dungeonData.rooms[0].y * this.gridSize
            );
            this.camera.setTarget(this.player);
        } catch (e) {
            console.error("Failed to load player:", e);
        }

        // --- Spawn NPCs ---
        for (let i = 1; i < dungeonData.rooms.length; i++) {
            const room = dungeonData.rooms[i];
            const isGoblin = Math.random() > 0.4;
            const npcType = isGoblin ? 'data/goblin.json' : 'data/orc.json';
            const weaponType = isGoblin ? 'data/axe.json' : 'data/mace.json';
            
            try {
                const res = await fetch(npcType);
                const data = await res.json();
                const npc = await this.loadVoxelModel(data, shadowGenerator, {
                    right: weaponType
                });
                npc.position = new BABYLON.Vector3(
                    (room.x + room.w / 2) * this.gridSize,
                    0,
                    (room.y + room.h / 2) * this.gridSize
                );
                // Random rotation
                npc.rotation.y = Math.random() * Math.PI * 2;
                npc.isMoving = true; // Make them walk in place for now
                this.entities.push(npc);
            } catch (e) {
                console.error("Failed to spawn NPC:", e);
            }
        }

        // --- Render Loop ---
        this.engine.runRenderLoop(() => {
            this.handlePlayerMovement();
            this.handleNPCMovement();
            this.updateAnimations();
            this.scene.render();
        });

        window.addEventListener("resize", () => this.engine.resize());
    },

    generateDungeon: function (width, height) {
        const grid = Array(height).fill().map(() => Array(width).fill(1));
        const rooms = [];

        for (let i = 0; i < 10; i++) {
            const rw = Math.floor(Math.random() * 4) + 4;
            const rh = Math.floor(Math.random() * 4) + 4;
            const rx = Math.floor(Math.random() * (width - rw - 2)) + 1;
            const ry = Math.floor(Math.random() * (height - rh - 2)) + 1;

            let overlap = false;
            rooms.forEach(r => {
                if (rx < r.x + r.w && rx + rw > r.x && ry < r.y + r.h && ry + rh > r.y) overlap = true;
            });

            if (!overlap) {
                for (let y = ry; y < ry + rh; y++) {
                    for (let x = rx; x < rx + rw; x++) {
                        grid[y][x] = 0;
                    }
                }
                rooms.push({ x: rx, y: ry, w: rw, h: rh });
            }
        }

        for (let i = 0; i < rooms.length - 1; i++) {
            this.carvePipes(grid, rooms[i], rooms[i + 1]);
        }

        return { grid, rooms };
    },

    carvePipes: function (grid, r1, r2) {
        let x1 = Math.floor(r1.x + r1.w / 2);
        let y1 = Math.floor(r1.y + r1.h / 2);
        let x2 = Math.floor(r2.x + r2.w / 2);
        let y2 = Math.floor(r2.y + r2.h / 2);

        for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
            grid[y1][x] = 0;
            if (y1 + 1 < grid.length) grid[y1 + 1][x] = 0;
        }
        for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
            grid[y][x2] = 0;
            if (x2 + 1 < grid[0].length) grid[y][x2 + 1] = 0;
        }
    },

    renderDungeon: function (grid, shadowGenerator) {
        const floorMat = new BABYLON.StandardMaterial("floorMat", this.scene);
        floorMat.diffuseColor = new BABYLON.Color3(0.2, 0.2, 0.25);
        floorMat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);

        const wallMat = new BABYLON.StandardMaterial("wallMat", this.scene);
        wallMat.diffuseColor = new BABYLON.Color3(0.4, 0.4, 0.45);
        wallMat.bumpTexture = new BABYLON.Texture("https://www.babylonjs-playground.com/textures/rockn.png", this.scene);

        for (let y = 0; y < grid.length; y++) {
            for (let x = 0; x < grid[0].length; x++) {
                const pos = new BABYLON.Vector3(x * this.gridSize, 0, y * this.gridSize);
                
                if (grid[y][x] === 0) {
                    const floor = BABYLON.MeshBuilder.CreatePlane("floor", { size: this.gridSize }, this.scene);
                    floor.rotation.x = Math.PI / 2;
                    floor.position = pos;
                    floor.material = floorMat;
                    floor.checkCollisions = true;
                    floor.receiveShadows = true;
                } else {
                    const wall = BABYLON.MeshBuilder.CreateBox("wall", { size: this.gridSize, height: 2.5 }, this.scene);
                    wall.position = pos.add(new BABYLON.Vector3(0, 1.25, 0));
                    wall.material = wallMat;
                    wall.checkCollisions = true;
                    shadowGenerator.addShadowCaster(wall);
                }
            }
        }
    },

    loadVoxelModel: async function (data, shadowGenerator, equipment = {}) {
        const root = BABYLON.MeshBuilder.CreateBox("root", { size: 0.1 }, this.scene);
        root.isVisible = false;
        root.checkCollisions = true;
        root.ellipsoid = new BABYLON.Vector3(0.4, 0.9, 0.4);
        root.ellipsoidOffset = new BABYLON.Vector3(0, 0.9, 0);

        const colors = data.ProceduralColors || { Skin: "#D2B48C", Shirt: "#71797E", Pants: "#3E2723" };
        
        const makeTex = (name, hexArray, w, h) => {
            if (!hexArray) return null;
            const res = 64;
            const dt = new BABYLON.DynamicTexture(name, res, this.scene, false);
            const ctx = dt.getContext();
            const pxW = res / w;
            const pxH = res / h;

            for (let i = 0; i < hexArray.length; i++) {
                const x = i % w;
                const y = Math.floor(i / w);
                ctx.fillStyle = hexArray[i];
                ctx.fillRect(x * pxW, y * pxH, pxW, pxH);
            }
            dt.update();
            dt.hasAlpha = false;
            dt.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
            dt.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
            return dt;
        };

        const texFace = makeTex("face", data.Textures.Face, 8, 8);
        const texChest = makeTex("chest", data.Textures.Chest, 8, 12);
        const texArms = makeTex("arms", data.Textures.Arms, 4, 12);
        const texLegs = makeTex("legs", data.Textures.Legs, 4, 13);

        const createPartMaterial = (color, texture) => {
            const mat = new BABYLON.StandardMaterial("partMat", this.scene);
            mat.diffuseColor = texture ? BABYLON.Color3.White() : BABYLON.Color3.FromHexString(color);
            mat.diffuseTexture = texture;
            return mat;
        };

        const skinMat = createPartMaterial(colors.Skin);
        const chestMat = createPartMaterial(colors.Shirt, texChest);
        const legMat = createPartMaterial(colors.Pants, texLegs);
        const armMat = createPartMaterial(colors.Shirt, texArms);

        const faceMat = new BABYLON.MultiMaterial("faceMulti", this.scene);
        const sideMat = skinMat;
        faceMat.subMaterials.push(createPartMaterial("#FFFFFF", texFace));
        faceMat.subMaterials.push(sideMat);
        faceMat.subMaterials.push(sideMat);
        faceMat.subMaterials.push(sideMat);
        faceMat.subMaterials.push(sideMat);
        faceMat.subMaterials.push(sideMat);

        const torso = BABYLON.MeshBuilder.CreateBox("torso", { width: 0.6, height: 0.8, depth: 0.3 }, this.scene);
        torso.parent = root;
        torso.position.y = 1.1;
        torso.material = chestMat;
        shadowGenerator.addShadowCaster(torso);

        const head = BABYLON.MeshBuilder.CreateBox("head", { size: 0.45 }, this.scene);
        head.parent = root;
        head.position.y = 1.75;
        head.material = faceMat;
        head.subMeshes = [];
        const verticesCount = head.getTotalVertices();
        new BABYLON.SubMesh(0, 0, verticesCount, 0, 6, head);
        new BABYLON.SubMesh(1, 0, verticesCount, 6, 6, head);
        new BABYLON.SubMesh(2, 0, verticesCount, 12, 6, head);
        new BABYLON.SubMesh(3, 0, verticesCount, 18, 6, head);
        new BABYLON.SubMesh(4, 0, verticesCount, 24, 6, head);
        new BABYLON.SubMesh(5, 0, verticesCount, 30, 6, head);
        shadowGenerator.addShadowCaster(head);

        const createArm = (isLeft) => {
            const pivot = new BABYLON.TransformNode("armPivot", this.scene);
            pivot.parent = torso;
            pivot.position.set(isLeft ? 0.4 : -0.4, 0.3, 0);
            const arm = BABYLON.MeshBuilder.CreateBox("arm", { width: 0.2, height: 0.7, depth: 0.2 }, this.scene);
            arm.parent = pivot;
            arm.position.y = -0.3;
            arm.material = armMat;
            shadowGenerator.addShadowCaster(arm);
            return pivot;
        };
        const armL = createArm(true);
        const armR = createArm(false);

        const createLeg = (isLeft) => {
            const pivot = new BABYLON.TransformNode("legPivot", this.scene);
            pivot.parent = root;
            pivot.position.set(isLeft ? 0.18 : -0.18, 0.7, 0);
            const leg = BABYLON.MeshBuilder.CreateBox("leg", { width: 0.25, height: 0.7, depth: 0.25 }, this.scene);
            leg.parent = pivot;
            leg.position.y = -0.3;
            leg.material = legMat;
            shadowGenerator.addShadowCaster(leg);
            return pivot;
        };
        const legL = createLeg(true);
        const legR = createLeg(false);

        // --- Equipment ---
        if (equipment.right) {
            const wp = await this.loadProp(equipment.right, shadowGenerator);
            if (wp) {
                wp.parent = armR;
                wp.position.y = -0.6;
                wp.rotation.x = Math.PI / 2;
            }
        }
        if (equipment.left) {
            const wp = await this.loadProp(equipment.left, shadowGenerator);
            if (wp) {
                wp.parent = armL;
                wp.position.y = -0.4;
                wp.position.x = 0.2;
                wp.rotation.y = -Math.PI / 2;
            }
        }

        root.userData = { armL, armR, legL, legR, ai: { target: null, idle: 0 } };
        return root;
    },

    loadProp: async function (url, shadowGenerator) {
        try {
            const response = await fetch(url);
            const data = await response.json();
            const group = new BABYLON.TransformNode("prop_" + url, this.scene);
            const parts = data.Parts || data.parts;
            if (parts) {
                parts.forEach(part => {
                    let mesh;
                    const shape = (part.Shape || part.shape || "Box").toLowerCase();
                    if (shape === "sphere") mesh = BABYLON.MeshBuilder.CreateSphere("p", { diameter: 1 }, this.scene);
                    else if (shape === "cylinder") mesh = BABYLON.MeshBuilder.CreateCylinder("p", { diameter: 1, height: 1 }, this.scene);
                    else mesh = BABYLON.MeshBuilder.CreateBox("p", { size: 1 }, this.scene);
                    mesh.parent = group;
                    const pos = part.Position || part.position || [0,0,0];
                    const rot = part.Rotation || part.rotation || [0,0,0];
                    const scale = part.Scale || part.scale || [1,1,1];
                    mesh.position = new BABYLON.Vector3(pos[0], pos[1], pos[2]);
                    mesh.rotation = new BABYLON.Vector3(rot[0] * Math.PI / 180, rot[1] * Math.PI / 180, rot[2] * Math.PI / 180);
                    mesh.scaling = new BABYLON.Vector3(scale[0], scale[1], scale[2]);
                    const mat = new BABYLON.StandardMaterial("propMat", this.scene);
                    mat.diffuseColor = BABYLON.Color3.FromHexString(part.ColorHex || part.colorHex || "#FFFFFF");
                    if ((part.Material || part.material || "").toLowerCase().includes("metal")) {
                        mat.specularPower = 64; mat.specularColor = new BABYLON.Color3(0.5, 0.5, 0.5);
                    } else if ((part.Material || part.material || "").toLowerCase().includes("glow")) {
                        mat.emissiveColor = mat.diffuseColor;
                    }
                    mesh.material = mat;
                    shadowGenerator.addShadowCaster(mesh);
                });
            }
            return group;
        } catch (e) {
            console.error("Error loading prop:", url, e); return null;
        }
    },

    handlePlayerMovement: function () {
        if (!this.player) return;
        const speed = 0.12;
        const rotSpeed = 0.05;
        let moving = false;
        if (this.inputMap["w"]) { this.player.moveWithCollisions(this.player.forward.scale(speed)); moving = true; }
        if (this.inputMap["s"]) { this.player.moveWithCollisions(this.player.forward.scale(-speed * 0.5)); moving = true; }
        if (this.inputMap["a"]) { this.player.rotation.y -= rotSpeed; }
        if (this.inputMap["d"]) { this.player.rotation.y += rotSpeed; }
        this.player.isMoving = moving;
    },

    handleNPCMovement: function () {
        const speed = 0.05;
        this.entities.forEach(npc => {
            const ai = npc.userData.ai;
            if (!ai.target) {
                if (ai.idle > 0) {
                    ai.idle--;
                    npc.isMoving = false;
                } else {
                    // Pick a random target within a small range
                    const angle = Math.random() * Math.PI * 2;
                    const dist = Math.random() * 5 + 2;
                    ai.target = new BABYLON.Vector3(
                        npc.position.x + Math.cos(angle) * dist,
                        0,
                        npc.position.z + Math.sin(angle) * dist
                    );
                }
            } else {
                // Move toward target
                const diff = ai.target.subtract(npc.position);
                if (diff.length() < 0.5) {
                    ai.target = null;
                    ai.idle = Math.floor(Math.random() * 100) + 50;
                } else {
                    // Smoothly rotate toward target
                    const targetRot = Math.atan2(diff.x, diff.z);
                    npc.rotation.y = BABYLON.Scalar.LerpAngle(npc.rotation.y, targetRot, 0.1);
                    
                    // Move forward
                    npc.moveWithCollisions(npc.forward.scale(speed));
                    npc.isMoving = true;
                }
            }
        });
    },

    updateAnimations: function () {
        const now = Date.now();
        const all = [this.player, ...this.entities];
        
        all.forEach(ent => {
            if (!ent || !ent.userData) return;
            const ud = ent.userData;
            if (ent.isMoving) {
                const speed = 0.008;
                const amp = 0.5;
                const swing = Math.sin(now * speed + (ent === this.player ? 0 : ent.uniqueId % 10));
                ud.legL.rotation.x = swing * amp;
                ud.legR.rotation.x = -swing * amp;
                ud.armL.rotation.x = -swing * amp * 0.8;
                ud.armR.rotation.x = swing * amp * 0.8;
            } else {
                ud.legL.rotation.x *= 0.8;
                ud.legR.rotation.x *= 0.8;
                ud.armL.rotation.x *= 0.8;
                ud.armR.rotation.x *= 0.8;
            }
        });
    }
};
