using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.JSInterop;
using _3DDungeonCrawler.Models;

namespace _3DDungeonCrawler.Services
{
    public enum GameState { MainMenu, CharacterSelect, ContinueMenu, Playing, ESCMenu, Shop, Bank, CharacterSheet }

    public class GameStateService
    {
        private readonly IJSRuntime _js;
        public event Action? OnStateChanged;

        private GameState _currentState = GameState.MainMenu;
        public GameState CurrentState 
        { 
            get => _currentState; 
            set 
            { 
                if (_currentState != value)
                {
                    _currentState = value; 
                    NotifyChange(); 
                }
            } 
        }

        public HeroSave? SaveData { get; private set; }
        public int ActiveSlot { get; private set; }
        public BankData Bank { get; private set; } = new BankData();
        public string LootMessage { get; set; } = "";

        public Dictionary<int, SlotMetadata> SlotMeta { get; } = new();

        public class SlotMetadata {
            public string Name { get; set; } = "Adventurer";
            public int Level { get; set; } = 1;
            public int Floor { get; set; } = 1;
            public string Class { get; set; } = "WARRIOR";
            public string Race { get; set; } = "HUMAN";
        }

        public GameStateService(IJSRuntime js)
        {
            _js = js;
        }

        public void NotifyChange() => OnStateChanged?.Invoke();

        public async Task Initialize()
        {
            await MigrateOldSave();
            await LoadMetadata();
            await LoadBank();
            NotifyChange();
        }

        private async Task MigrateOldSave()
        {
            try {
                var oldSave = await _js.InvokeAsync<string>("localStorage.getItem", "dungeonSave");
                if (!string.IsNullOrEmpty(oldSave)) {
                    var slot0 = await _js.InvokeAsync<string>("localStorage.getItem", "dungeonSave_slot_0");
                    if (string.IsNullOrEmpty(slot0)) {
                        await _js.InvokeVoidAsync("localStorage.setItem", "dungeonSave_slot_0", oldSave);
                    }
                    await _js.InvokeVoidAsync("localStorage.removeItem", "dungeonSave");
                }
            } catch {}
        }

        public async Task LoadMetadata()
        {
            try {
                SlotMeta.Clear();
                for (int i = 0; i < 3; i++) {
                    var json = await _js.InvokeAsync<string>("localStorage.getItem", "dungeonSave_slot_" + i);
                    if (!string.IsNullOrEmpty(json)) {
                        var save = System.Text.Json.JsonSerializer.Deserialize<HeroSave>(json, new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                        if (save != null) {
                            SlotMeta[i] = new SlotMetadata {
                                Name = save.Name,
                                Level = save.Level,
                                Floor = save.CurrentLevel,
                                Class = save.Class,
                                Race = save.Race
                            };
                        }
                    }
                }
            } catch {}
        }

        public async Task LoadBank()
        {
            try {
                var json = await _js.InvokeAsync<string>("localStorage.getItem", "dungeonSave_bank");
                if (!string.IsNullOrEmpty(json)) {
                    Bank = System.Text.Json.JsonSerializer.Deserialize<BankData>(json, new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? new BankData();
                } else {
                    await SaveBank();
                }
            } catch { }
        }

        public async Task SaveBank()
        {
            await _js.InvokeVoidAsync("localStorage.setItem", "dungeonSave_bank", System.Text.Json.JsonSerializer.Serialize(Bank));
        }

        public async Task CreateCharacter(int slot, string name, string race, string cls)
        {
            int startHP = race == "DWARF" ? 120 : 100;
            int startDmg = race == "ELF" ? 2 : 0;

            var save = new HeroSave {
                Name = name,
                Race = race,
                Class = cls,
                MaxHealth = startHP,
                BonusDmg = startDmg
            };

            ActiveSlot = slot;
            await SaveHero(save);
            SaveData = save;
            await LoadMetadata();
            CurrentState = GameState.ContinueMenu;
            NotifyChange();
        }

        public async Task LoadCharacter(int slot)
        {
            ActiveSlot = slot;
            var json = await _js.InvokeAsync<string>("localStorage.getItem", "dungeonSave_slot_" + slot);
            if (!string.IsNullOrEmpty(json)) {
                SaveData = System.Text.Json.JsonSerializer.Deserialize<HeroSave>(json, new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                CurrentState = GameState.ContinueMenu;
                NotifyChange();
            }
        }

        public async Task SaveHero(HeroSave save)
        {
            var json = System.Text.Json.JsonSerializer.Serialize(save);
            await _js.InvokeVoidAsync("localStorage.setItem", "dungeonSave_slot_" + ActiveSlot, json);
            SaveData = save;
        }

        public async Task UpdateSave()
        {
            if (SaveData != null) await SaveHero(SaveData);
            NotifyChange();
        }

        public async Task DeleteCharacter(int slot)
        {
            await _js.InvokeVoidAsync("localStorage.removeItem", "dungeonSave_slot_" + slot);
            await LoadMetadata();
            NotifyChange();
        }

        public int GetWeaponPower() => SaveData?.Equipment?.RightHand?.Power ?? 0;

        public int GetTotalArmor()
        {
            if (SaveData?.Equipment == null) return 0;
            int total = 0;
            string[] slots = { "head", "chest", "hands", "legs", "feet", "leftHand" };
            foreach(var s in slots) total += SaveData.Equipment.GetSlot(s)?.Power ?? 0;
            return total;
        }

        public int GetSellPrice(GameItem item)
        {
            int basePrice = item.Tier switch { "Steel" => 100, "Mythril" => 300, _ => 25 };
            int bonus = item.Power * (item.Tier == "Mythril" ? 20 : (item.Tier == "Steel" ? 10 : 5));
            return basePrice + bonus;
        }

        public async Task SellItem(int index)
        {
            if (SaveData == null || index < 0 || index >= SaveData.Inventory.Count) return;
            var item = SaveData.Inventory[index];
            SaveData.Gold += GetSellPrice(item);
            SaveData.Inventory.RemoveAt(index);
            await UpdateAndSave();
        }

        public async Task UpdateAndSave()
        {
            if (SaveData != null) await SaveHero(SaveData);
            // Sync with JS engine if playing
            if (CurrentState == GameState.Playing || CurrentState == GameState.ESCMenu) {
                await _js.InvokeVoidAsync("window.DungeonCrawler.updateEquipment", SaveData?.Equipment);
            }
            NotifyChange();
        }

        public async Task EquipItem(int index)
        {
            if (SaveData == null || index < 0 || index >= SaveData.Inventory.Count) return;
            var item = SaveData.Inventory[index];
            var slot = item.Slot;
            
            SaveData.Inventory.RemoveAt(index);
            var oldItem = SaveData.Equipment.GetSlot(slot);
            if (oldItem != null) SaveData.Inventory.Add(oldItem);
            
            SaveData.Equipment.SetSlot(slot, item);
            await UpdateAndSave();
        }

        public async Task UnequipItem(string slot)
        {
            if (SaveData == null) return;
            var item = SaveData.Equipment.GetSlot(slot);
            if (item != null) {
                SaveData.Inventory.Add(item);
                SaveData.Equipment.SetSlot(slot, null);
                await UpdateAndSave();
            }
        }

        public async Task BuyHeal()
        {
            if (SaveData != null && SaveData.Gold >= 25) {
                SaveData.Gold -= 25;
                // Healing handled by the engine normally, but we deduct gold here.
                await UpdateAndSave();
            }
        }

        public async Task BuyStrength()
        {
            if (SaveData != null && SaveData.Gold >= 150) {
                SaveData.Gold -= 150;
                SaveData.BonusDmg += 5;
                await UpdateAndSave();
            }
        }

        public async Task BuyItem(string name, string slot, string model, int price)
        {
            if (SaveData != null && SaveData.Gold >= price) {
                SaveData.Gold -= price;
                SaveData.Inventory.Add(new GameItem { Name = name, Slot = slot, ModelPath = model, Power = 1, Tier = "Iron" });
                await UpdateAndSave();
            }
        }

        public async Task DepositToBank(int index)
        {
            if (SaveData == null || Bank.Items.Count >= 24 || index < 0 || index >= SaveData.Inventory.Count) return;
            var item = SaveData.Inventory[index];
            SaveData.Inventory.RemoveAt(index);
            Bank.Items.Add(item);
            await UpdateAndSave();
            await SaveBank();
        }

        public async Task WithdrawFromBank(int index)
        {
            if (SaveData == null || SaveData.Inventory.Count >= 16 || index < 0 || index >= Bank.Items.Count) return;
            var item = Bank.Items[index];
            Bank.Items.RemoveAt(index);
            SaveData.Inventory.Add(item);
            await UpdateAndSave();
            await SaveBank();
        }

        public async Task DepositAllGold()
        {
            if (SaveData != null && SaveData.Gold > 0) {
                Bank.Gold += SaveData.Gold;
                SaveData.Gold = 0;
                await UpdateAndSave();
                await SaveBank();
            }
        }

        public async Task WithdrawAllGold()
        {
            if (SaveData != null && Bank.Gold > 0) {
                SaveData.Gold += Bank.Gold;
                Bank.Gold = 0;
                await UpdateAndSave();
                await SaveBank();
            }
        }

        public async Task ClaimBossLoot(int dungeonLevel)
        {
            if (SaveData == null) return;
            string[] slots = { "head", "chest", "hands", "legs", "feet", "rightHand", "leftHand" };
            string slot = slots[new Random().Next(slots.Length)];
            string tier = dungeonLevel < 3 ? "Iron" : (dungeonLevel < 7 ? "Steel" : "Mythril");
            string name = $"{tier} {slot[0].ToString().ToUpper() + slot.Substring(1)}";
            if (slot.Contains("Hand")) name = $"{tier} {(slot == "rightHand" ? "Sword" : "Shield")}";
            string model = slot == "leftHand" ? "data/shield.json" : (slot == "rightHand" ? "data/sword.json" : "data/shield.json");

            var newItem = new GameItem { Name = name, Slot = slot, ModelPath = model, Power = dungeonLevel, Tier = tier };
            SaveData.Inventory.Add(newItem);
            await UpdateAndSave();
            LootMessage = name;
            NotifyChange();
            await Task.Delay(4000);
            LootMessage = "";
            NotifyChange();
        }
        public async Task OpenShop()
        {
            CurrentState = GameState.Shop;
            await Task.Delay(150);
            await _js.InvokeVoidAsync("window.DungeonCrawler.initPortrait", "portraitCanvas", SaveData);
        }

        public async Task OpenCharacterSheet()
        {
            CurrentState = GameState.CharacterSheet;
            await Task.Delay(150);
            await _js.InvokeVoidAsync("window.DungeonCrawler.initPortrait", "portraitCanvas", SaveData);
        }
    }
}
