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
        const cost = 10;
        if (this.stamina < cost) {
            this.showDamageText("LOW STAMINA", this.player.position.clone(), "orange");
            return;
        }
        this.stamina -= cost;
        this.performSwing(this.player);
        let weaponPower = 0; if (this.equipment.rightHand && this.equipment.rightHand.power) weaponPower = this.equipment.rightHand.power;
        const dmg = 15 + (this.level * 2) + this.bonusDmg + (weaponPower * 5);
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
                                const dmg = Math.max(1, baseDmg - armorPower);
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
    }
});
