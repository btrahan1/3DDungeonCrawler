using System.Collections.Generic;

namespace _3DDungeonCrawler.Models
{
    public class HeroSave
    {
        public string Name { get; set; } = "ADVENTURER";
        public string Class { get; set; } = "WARRIOR";
        public string Race { get; set; } = "HUMAN";
        public int Level { get; set; } = 1;
        public int XP { get; set; } = 0;
        public int XPToNext { get; set; } = 100;
        public int Gold { get; set; } = 0;
        public int CurrentLevel { get; set; } = 1;
        public int MaxHealth { get; set; } = 100;
        public int BonusDmg { get; set; } = 0;

        public int Stamina { get; set; } = 50;
        public int MaxStamina { get; set; } = 50;
        public int Mana { get; set; } = 50;
        public int MaxMana { get; set; } = 50;

        public int UnassignedStats { get; set; } = 0;

        // Core Attributes (Base 10)
        public int Strength { get; set; } = 10;
        public int Dexterity { get; set; } = 10;
        public int Constitution { get; set; } = 10;
        public int Intelligence { get; set; } = 10;
        public int Wisdom { get; set; } = 10;
        public int Charisma { get; set; } = 10;
        public Equipment Equipment { get; set; } = new Equipment();
        public List<GameItem> Inventory { get; set; } = new List<GameItem>();
    }

    public class Equipment
    {
        public GameItem? Head { get; set; }
        public GameItem? Chest { get; set; }
        public GameItem? Hands { get; set; }
        public GameItem? Legs { get; set; }
        public GameItem? Feet { get; set; }
        public GameItem? RightHand { get; set; }
        public GameItem? LeftHand { get; set; }

        public GameItem? GetSlot(string slot) => slot switch {
            "head" => Head,
            "chest" => Chest,
            "hands" => Hands,
            "legs" => Legs,
            "feet" => Feet,
            "rightHand" => RightHand,
            "leftHand" => LeftHand,
            _ => null
        };

        public void SetSlot(string slot, GameItem? item)
        {
            switch (slot) {
                case "head": Head = item; break;
                case "chest": Chest = item; break;
                case "hands": Hands = item; break;
                case "legs": Legs = item; break;
                case "feet": Feet = item; break;
                case "rightHand": RightHand = item; break;
                case "leftHand": LeftHand = item; break;
            }
        }
    }

    public class GameItem
    {
        public string Id { get; set; } = System.Guid.NewGuid().ToString();
        public string Name { get; set; } = "";
        public string Slot { get; set; } = "";
        public string ModelPath { get; set; } = "";
        public int Power { get; set; } = 1;
        public string Tier { get; set; } = "Iron";
        public string WeaponType { get; set; } = "Melee"; // Melee, Ranged, Staff
    }

    public class BankData
    {
        public int Gold { get; set; } = 0;
        public List<GameItem> Items { get; set; } = new List<GameItem>();
    }
}
