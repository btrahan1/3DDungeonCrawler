// Systems Module for Babylon.js Dungeon Crawler (Combat, AI, Interactions)
window.DungeonCrawler = Object.assign(window.DungeonCrawler || {}, {
    performSwing: function (entity) {
        if (entity.isSwinging) return;
        entity.isSwinging = true; const arm = entity.userData.armR;
        const anim = new BABYLON.Animation("sw", "rotation.x", 60, 0, 0); anim.setKeys([{frame:0, value:0}, {frame:10, value:1.5}, {frame:20, value:0}]);
        arm.animations = [anim]; this.scene.beginAnimation(arm, 0, 20, false, 1.5, () => entity.isSwinging = false);
    },

    handlePlayerAttack: function () {
        if (this.isDead || this.player.isSwinging) return;
        
        const weapon = this.equipment.rightHand;
        const isRanged = weapon && weapon.weaponType === "Ranged";
        const isStaff = weapon && weapon.weaponType === "Staff";
        
        if (isStaff) {
            const manaCost = 15;
            if (this.mana < manaCost) {
                this.showDamageText("LOW MANA", this.player.position.clone(), "cyan");
                return;
            }
            this.mana -= manaCost;
        } else {
            const staminaCost = isRanged ? 15 : 10;
            if (this.stamina < staminaCost) {
                this.showDamageText("LOW STAMINA", this.player.position.clone(), "orange");
                return;
            }
            this.stamina -= (this.nextAttackPowerMultiplier > 1.0) ? 0 : staminaCost;
        }
        
        if (isRanged) {
            this.fireArrow();
        } else if (isStaff) {
            this.fireMageBolt();
        } else {
            this.performSwing(this.player);
            let weaponPower = weapon?.power || 0;
            const multiplier = this.nextAttackPowerMultiplier || 1.0;
            this.nextAttackPowerMultiplier = 1.0; 
            const dmg = Math.floor((15 + (this.level * 2) + (this.bonusDmg || 0) + (weaponPower * 5)) * multiplier);
            setTimeout(() => {
                this.entities.forEach(n => {
                    if (BABYLON.Vector3.Distance(this.player.position, n.position) < 3 && BABYLON.Vector3.Dot(this.player.forward, n.position.subtract(this.player.position).normalize()) > 0.5) {
                        n.health -= dmg; n.healthContainerUI.isVisible = true; n.healthBarUI.width = (n.health/n.maxHealth*100) + "%";
                        n.moveWithCollisions(n.position.subtract(this.player.position).normalize().scale(0.6)); this.showDamageText("-" + dmg, n.position.clone(), "white");
                        if (n.health <= 0) {
                            if (n.isBoss) this.spawnBossChest(n.position.clone());
                            this.addXP(n.isBoss ? 150 : (n.maxHealth > 40 ? 40 : 15));
                            this.entities = this.entities.filter(e => e !== n);
                            n.healthContainerUI.dispose(); n.dispose();
                        }
                    }
                });
            }, 150);
        }
    },

    fireArrow: async function () {
        if (this.player.isSwinging) return;
        this.player.isSwinging = true;
        setTimeout(() => this.player.isSwinging = false, 500);

        const weapon = this.equipment.rightHand;
        const weaponPower = weapon?.power || 0;
        const dex = (this.attributes?.dexterity || 10);
        const dmg = 12 + (this.level * 2) + (dex - 10) * 4 + (weaponPower * 5);
        
        const arrow = await this.loadProp('data/arrow.json', null);
        arrow.position = this.player.position.clone().add(new BABYLON.Vector3(0, 1.2, 0)).add(this.player.forward.scale(0.5));
        arrow.rotation = this.player.rotation.clone();
        arrow.rotation.y += Math.PI; // Correct for model orientation if needed
        
        const velocity = this.player.forward.scale(0.5);
        this.projectiles.push({ mesh: arrow, velocity: velocity, damage: dmg, lifetime: 100 });
    },

    fireMageBolt: async function () {
        if (this.player.isSwinging) return;
        this.player.isSwinging = true;
        setTimeout(() => this.player.isSwinging = false, 500);

        const weapon = this.equipment.rightHand;
        const weaponPower = weapon?.power || 0;
        const intel = (this.attributes?.intelligence || 10);
        const dmg = 15 + (this.level * 2) + (intel - 10) * 6 + (weaponPower * 5);
        
        const bolt = await this.loadProp('data/bolt.json', null);
        bolt.position = this.player.position.clone().add(new BABYLON.Vector3(0, 1.3, 0)).add(this.player.forward.scale(0.4));
        bolt.rotation = this.player.rotation.clone();
        
        const velocity = this.player.forward.scale(0.35); // Slightly slower than arrow
        this.projectiles.push({ mesh: bolt, velocity: velocity, damage: dmg, lifetime: 80 });
    },

    updateProjectiles: function () {
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            p.mesh.position.addInPlace(p.velocity);
            p.lifetime--;

            let hit = false;
            for (let j = this.entities.length - 1; j >= 0; j--) {
                const n = this.entities[j];
                if (BABYLON.Vector3.Distance(p.mesh.position, n.position.add(new BABYLON.Vector3(0, 1, 0))) < 1.0) {
                    n.health -= p.damage; n.healthContainerUI.isVisible = true; n.healthBarUI.width = (n.health/n.maxHealth*100) + "%";
                    n.moveWithCollisions(p.velocity.scale(0.4)); this.showDamageText("-" + p.damage, n.position.clone(), "white");
                    if (n.health <= 0) {
                        if (n.isBoss) this.spawnBossChest(n.position.clone());
                        this.addXP(n.isBoss ? 150 : (n.maxHealth > 40 ? 40 : 15));
                        this.entities = this.entities.filter(e => e !== n);
                        n.healthContainerUI.dispose(); n.dispose();
                    }
                    hit = true; break;
                }
            }

            if (hit || p.lifetime <= 0) {
                p.mesh.dispose();
                this.projectiles.splice(i, 1);
            }
        }
    },

    addXP: function (amount) {
        if (this.dotnetRef) {
            this.dotnetRef.invokeMethodAsync("AddXP", amount);
        }
    },

    triggerLevelUpEffect: function () {
        this.showDamageText("LEVEL UP!", this.player.position.clone(), "gold");
        // We could add more particles or sound effects here later
    },

    handleNPCMovement: function () {
        const now = Date.now();
        this.entities.forEach(n => {
            const ai = n.userData.ai; const dist = BABYLON.Vector3.Distance(n.position, this.player.position);
            if (dist < 12.0) {
                const targetRotation = Math.atan2(this.player.position.x - n.position.x, this.player.position.z - n.position.z);
                n.rotation.y = BABYLON.Scalar.LerpAngle(n.rotation.y, targetRotation, 0.1);
                if (dist > 2.01) {
                    n.isMoving = true; let moveDir = n.forward.clone();
                    if (ai.lastPos && BABYLON.Vector3.Distance(n.position, ai.lastPos) < 0.005) {
                        ai.stuckCount++;
                        if (ai.stuckCount > 10) { const pivot = (n.uniqueId % 2 === 0 ? 1 : -1) * Math.PI / 4; moveDir = new BABYLON.Vector3(Math.sin(n.rotation.y + pivot), 0, Math.cos(n.rotation.y + pivot)); }
                    } else ai.stuckCount = 0;
                    ai.lastPos = n.position.clone(); n.moveWithCollisions(moveDir.scale(n.isBoss ? 0.08 : 0.06));
                } else {
                    n.isMoving = false;
                    if (now - (ai.lastAtk || 0) > 2500) {
                        this.performSwing(n); ai.lastAtk = now;
                        setTimeout(() => {
                            if (BABYLON.Vector3.Distance(n.position, this.player.position) < 2.5) {
                                let armorPower = 0; const slots = ["head", "chest", "hands", "legs", "feet", "leftHand"];
                                slots.forEach(s => { if (this.equipment[s] && this.equipment[s].power) armorPower += this.equipment[s].power; });
                                const baseDmg = (n.isBoss ? this.currentLevel * 3 : this.currentLevel) + Math.floor(this.currentLevel/2) + 5;
                                let dmg = Math.max(1, baseDmg - armorPower);
                                if (this.isShieldActive) dmg = Math.floor(dmg * 0.5);
                                this.player.health -= dmg; this.showDamageText("-" + dmg, this.player.position.clone(), "red");
                            }
                        }, 250);
                    }
                }
            } else {
                if (!ai.target) { if (ai.idle > 0) { ai.idle--; n.isMoving = false; } else { ai.target = new BABYLON.Vector3(n.position.x + (Math.random()-0.5)*10, 0, n.position.z + (Math.random()-0.5)*10); ai.lastPos = n.position.clone(); ai.stuckCount = 0; } }
                else {
                    const diff = ai.target.subtract(n.position);
                    if (diff.length() < 0.5) { ai.target = null; ai.idle = 50 + Math.random()*100; }
                    else {
                        if (ai.lastPos && BABYLON.Vector3.Distance(n.position, ai.lastPos) < 0.005) { ai.stuckCount++; if (ai.stuckCount > 30) { ai.target = null; ai.idle = 10; return; } } else ai.stuckCount = 0;
                        ai.lastPos = n.position.clone(); n.rotation.y = BABYLON.Scalar.LerpAngle(n.rotation.y, Math.atan2(diff.x, diff.z), 0.1); n.moveWithCollisions(n.forward.scale(0.04)); n.isMoving = true;
                    }
                }
            }
        });
    },

    handleInteractions: function () {
        this.chests.forEach(c => {
            if (BABYLON.Vector3.Distance(this.player.position, c.position) < 2 && !c.isOpen) {
                c.isOpen = true;
                if (c.isBossChest && this.dotnetRef) this.dotnetRef.invokeMethodAsync("ClaimBossLoot", this.currentLevel);
                else if (c.isPotionChest) {
                    const r = Math.random();
                    let type = "hp";
                    let label = "HEALTH";
                    if (r > 0.9) { type = "rest"; label = "RESTORATION"; }
                    else if (r > 0.6) { type = "mp"; label = "MANA"; }
                    else if (r > 0.3) { type = "st"; label = "STAMINA"; }
                    
                    if (this.dotnetRef) this.dotnetRef.invokeMethodAsync("AddPotion", type);
                    this.showDamageText("FOUND " + label + " POTION", c.position.clone(), "#00ffff");
                }
                else { 
                    const lootGold = Math.floor(Math.random() * 30) + 20 * this.currentLevel; 
                    if (this.dotnetRef) this.dotnetRef.invokeMethodAsync("AddGold", lootGold);
                    this.showDamageText("+" + lootGold + " GOLD", c.position.clone(), "gold"); 
                }
                const lid = c.getChildren().find(ch => ch.position.y > 0.5);
                if (lid) { const a = new BABYLON.Animation("o", "rotation.x", 30, 0, 0); a.setKeys([{frame:0, value:0}, {frame:15, value:-1.5}]); lid.animations = [a]; this.scene.beginAnimation(lid, 0, 15, false); }
            }
        });
    },

    spawnBossChest: async function (p) {
        const c = await this.loadProp('data/chest.json', null);
        c.position = p; c.isChest = true; c.isBossChest = true; this.chests.push(c);
        c.getChildMeshes().forEach(m => { if (m.material) { const mat = m.material.clone("gc"); mat.diffuseColor = new BABYLON.Color3(1, 0.84, 0); mat.emissiveColor = new BABYLON.Color3(0.2, 0.1, 0); m.material = mat; } });
        this.showDamageText("BOSS DEFEATED! LOOT SPAWNED!", p, "gold");
    },
    
    handleHealSpell: function () {
        if (this.isDead) return;
        const manaCost = 10;
        if (this.mana < manaCost) {
            this.showDamageText("LOW MANA", this.player.position.clone(), "cyan");
            return;
        }
        if (this.player.health >= this.maxHealth) {
            this.showDamageText("FULL HEALTH", this.player.position.clone(), "white");
            return;
        }

        this.mana -= manaCost;
        const healAmt = this.attributes.wisdom || 10;
        this.player.health = Math.min(this.maxHealth, this.player.health + healAmt);
        this.showDamageText("+" + healAmt + " HP", this.player.position.clone(), "#32cd32");
        this.flashPlayer("#32cd32");
        
        if (this.dotnetRef) this.dotnetRef.invokeMethodAsync("UseAbilitySync", Math.floor(this.mana), Math.floor(this.stamina));
        this.updateHUD();
    },

    handlePowerStrike: function() {
        const now = Date.now();
        const cooldown = 10000;
        if (this.powerStrikeLastUsed && now - this.powerStrikeLastUsed < cooldown) {
            const remain = Math.ceil((cooldown - (now - this.powerStrikeLastUsed)) / 1000);
            this.showDamageText("COOLDOWN: " + remain + "s", this.player.position.clone(), "#aaa");
            return;
        }

        if (this.stamina < 25) {
            this.showDamageText("LOW STAMINA", this.player.position.clone(), "#ffd700");
            return;
        }
        this.stamina -= 25;
        this.nextAttackPowerMultiplier = 2.5;
        this.powerStrikeLastUsed = now;
        this.showDamageText("POWER STRIKE!", this.player.position.clone(), "#ffff00");
        this.flashPlayer("#ffff00");
        
        // Trigger attack immediately
        this.handlePlayerAttack();

        if (this.dotnetRef) this.dotnetRef.invokeMethodAsync("UseAbilitySync", Math.floor(this.mana), Math.floor(this.stamina));
        this.updateHUD();
    },

    handleShieldSpell: function() {
        if (this.mana < 20) {
            this.showDamageText("LOW MANA", this.player.position.clone(), "#1e90ff");
            return;
        }
        this.mana -= 20;
        this.isShieldActive = true;
        this.showDamageText("SHIELD ACTIVE", this.player.position.clone(), "#00ffff");
        this.flashPlayer("#00ffff");
        
        setTimeout(() => {
            this.isShieldActive = false;
            this.showDamageText("SHIELD FADED", this.player.position.clone(), "#aaa");
        }, 10000);

        if (this.dotnetRef) this.dotnetRef.invokeMethodAsync("UseAbilitySync", Math.floor(this.mana), Math.floor(this.stamina));
        this.updateHUD();
    },

    flashPlayer: function(hex) {
        if (this.player && this.player.getChildMeshes) {
            const flashColor = BABYLON.Color3.FromHexString(hex);
            this.player.getChildMeshes().forEach(m => {
                if (m.material) {
                    const oldEmissive = m.material.emissiveColor?.clone() || new BABYLON.Color3(0,0,0);
                    m.material.emissiveColor = flashColor.scale(0.5);
                    setTimeout(() => m.material.emissiveColor = oldEmissive, 300);
                }
            });
        }
    },

    handleUsePotion: function (type) {
        if (this.isDead) return;
        if (this.potions[type] <= 0) {
            this.showDamageText("OUT OF POTIONS", this.player.position.clone(), "#ff4444");
            return;
        }

        let healed = false;
        let color = "#ffffff";
        let msg = "";

        if (type === "hp") {
            if (this.player.health < this.maxHealth) {
                this.player.health = this.maxHealth;
                msg = "FULL HP"; color = "#ff4444"; healed = true;
            }
        } else if (type === "st") {
            if (this.stamina < this.maxStamina) {
                this.stamina = this.maxStamina;
                msg = "FULL STA"; color = "#ffd700"; healed = true;
            }
        } else if (type === "mp") {
            if (this.mana < this.maxMana) {
                this.mana = this.maxMana;
                msg = "FULL MANA"; color = "#1e90ff"; healed = true;
            }
        } else if (type === "rest") {
            this.player.health = this.maxHealth;
            this.stamina = this.maxStamina;
            this.mana = this.maxMana;
            msg = "RESTORATION"; color = "#e040fb"; healed = true;
        }

        if (healed) {
            this.potions[type]--;
            this.showDamageText(msg, this.player.position.clone(), color);
            if (this.dotnetRef) this.dotnetRef.invokeMethodAsync("UsePotion", type);
            
            if (this.player.getChildMeshes) {
                const flashColor = BABYLON.Color3.FromHexString(color);
                this.player.getChildMeshes().forEach(m => {
                    if (m.material) {
                        const oldEmissive = m.material.emissiveColor?.clone() || new BABYLON.Color3(0,0,0);
                        m.material.emissiveColor = flashColor.scale(0.5);
                        setTimeout(() => m.material.emissiveColor = oldEmissive, 300);
                    }
                });
            }
            this.updateHUD();
        } else {
            this.showDamageText("ALREADY FULL", this.player.position.clone(), "white");
        }
    },

    getGridPath: function(startPos, endPos) {
        if (!this.dungeonData || !this.dungeonData.grid) return [];
        const grid = this.dungeonData.grid;
        const gridW = grid[0].length, gridH = grid.length;
        const startX = Math.round(startPos.x / this.gridSize), startY = Math.round(startPos.z / this.gridSize);
        const endX = Math.round(endPos.x / this.gridSize), endY = Math.round(endPos.z / this.gridSize);

        if (startX === endX && startY === endY) return [];

        const openSet = [{ x: startX, y: startY, g: 0, h: Math.abs(startX - endX) + Math.abs(startY - endY), f: 0, parent: null }];
        const closedSet = new Set();
        
        while (openSet.length > 0) {
            openSet.sort((a, b) => a.f - b.f);
            const current = openSet.shift();
            if (current.x === endX && current.y === endY) {
                const path = []; let temp = current;
                while (temp.parent) { path.push(new BABYLON.Vector3(temp.x * this.gridSize, 0.1, temp.y * this.gridSize)); temp = temp.parent; }
                return path.reverse();
            }
            closedSet.add(`${current.x},${current.y}`);
            for (let [dx, dy] of [[0,1],[0,-1],[1,0],[-1,0]]) {
                const nx = current.x + dx, ny = current.y + dy;
                if (nx < 0 || ny < 0 || nx >= gridW || ny >= gridH || grid[ny][nx] === 1 || closedSet.has(`${nx},${ny}`)) continue;
                const g = current.g + 1;
                const h = Math.abs(nx - endX) + Math.abs(ny - endY);
                const neighbor = { x: nx, y: ny, g, h, f: g + h, parent: current };
                const existing = openSet.find(o => o.x === nx && o.y === ny);
                if (!existing) openSet.push(neighbor);
                else if (g < existing.g) { existing.g = g; existing.f = g + h; existing.parent = current; }
            }
            if (closedSet.size > 5000) break; // Safety limit
        }
        return [];
    },

    findNextAutoPlayTarget: function() {
        // Priority: Living Enemies > Unopened Chests
        let targets = this.entities.filter(e => e.isNPC && e.health > 0);
        if (targets.length === 0) {
            targets = this.chests.filter(c => !c.isOpen);
        }
        if (targets.length === 0) return null;
        
        // Sort by distance
        targets.sort((a, b) => BABYLON.Vector3.Distance(this.player.position, a.position) - BABYLON.Vector3.Distance(this.player.position, b.position));
        return targets[0];
    },

    handleAutoPlay: function() {
        if (!this.isAutoPlayActive || this.isDead || !this.player) return;

        // 1. Target Acquisition
        if (!this.autoPlayTarget || 
            (this.autoPlayTarget.isNPC && this.autoPlayTarget.health <= 0) || 
            (this.autoPlayTarget.isChest && this.autoPlayTarget.isOpen)) {
            this.autoPlayTarget = this.findNextAutoPlayTarget();
            this.autoPlayPath = [];
            if (!this.autoPlayTarget) {
                this.isAutoPlayActive = false;
                this.showDamageText("ALL CLEAR!", this.player.position.clone(), "gold");
                this.promptText.text = "";
                if (this.initAutoToggle) this.initAutoToggle();
                return;
            }
        }
        
        this.promptText.text = "AUTO-PLAYING: TARGETING " + (this.autoPlayTarget.isNPC ? "ENEMY" : "CHEST");

        // 2. Pathfinding
        const dist = BABYLON.Vector3.Distance(this.player.position, this.autoPlayTarget.position);
        
        // If it's an enemy, we want to be close enough to attack
        const interactDist = this.autoPlayTarget.isNPC ? 2.5 : 1.8;

        if (dist <= interactDist) {
            // Face target
            const dir = this.autoPlayTarget.position.subtract(this.player.position);
            this.player.rotation.y = Math.atan2(dir.x, dir.z);
            
            if (this.autoPlayTarget.isNPC) {
                if (!this.player.isSwinging) this.handlePlayerAttack();
            } else if (this.autoPlayTarget.isChest) {
                this.handleInteractions();
            }
            return;
        }

        // 3. Movement
        if (this.autoPlayPath.length === 0) {
             this.autoPlayPath = this.getGridPath(this.player.position, this.autoPlayTarget.position);
             if (this.autoPlayPath.length === 0 && dist > interactDist) {
                 // No path found
                 this.isAutoPlayActive = false;
                 this.showDamageText("PATH BLOCKED", this.player.position.clone(), "red");
                 if (this.initAutoToggle) this.initAutoToggle();
                 return;
             }
        }

        if (this.autoPlayPath.length > 0) {
            const nextPoint = this.autoPlayPath[0];
            const toNext = nextPoint.subtract(this.player.position);
            if (toNext.length() < 0.5) {
                this.autoPlayPath.shift();
            } else {
                this.player.rotation.y = Math.atan2(toNext.x, toNext.z);
                this.player.moveWithCollisions(this.player.forward.scale(0.12));
                this.player.isMoving = true;
            }
        }
    }
});
