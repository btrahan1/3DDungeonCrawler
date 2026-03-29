using Microsoft.AspNetCore.Components;

namespace _3DDungeonCrawler.Utils
{
    public static class IconHelper
    {
        public static string GetSvgIcon(string slot)
        {
            string color = "currentColor";
            string head = "<path d='M12 2L4 5v6c0 5.5 3.5 10.3 8 12 4.5-1.7 8-6.5 8-12V5l-8-3zm0 2l6 2.2v4.8c0 4.1-2.6 7.8-6 9.2-3.4-1.4-6-5.1-6-9.2V6.2L12 4zm-1 3v2h2V7h-2z'/>";
            string chest = "<path d='M12 2L4 5v2c0 2.3 1.1 4.5 3 6v7h10v-7c1.9-1.5 3-3.7 3-6V5l-8-3zM8 7h8v3H8V7zm2 5h4v5h-4v-5z'/>";
            string hands = "<path d='M6 10c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h4c1.1 0 2-.9 2-2v-4h4v4c0 1.1.9 2 2 2h4c1.1 0 2-.9 2-2v-8c0-1.1-.9-2-2-2h-14zm2 2h2v6H8v-6zm12 0h2v6h-2v-6z'/>";
            string legs = "<path d='M6 2v10c0 4 3 7 3 10h6c0-3 3-6 3-10V2H6zm2 2h8v6H8V4zm2 8h4v6h-4v-6z'/>";
            string feet = "<path d='M6 18l-2 4h4l1-2h6l1 2h4l-2-4V10H6v8zm2-6h8v4H8v-4z'/>";
            string rightHand = "<path d='M19.3 4.7L18 3.4 11 10.4 7.5 7 6.1 8.4 9.6 11.9 3.4 18.1 6.1 20.8 12.3 14.6 15.8 18.1 17.2 16.7 13.7 13.2z'/>";
            string leftHand = "<path d='M12 2L4 5v6c0 5.5 3.5 10.3 8 12 4.5-1.7 8-6.5 8-12V5l-8-3zm0 2l6 2.2v4.8c0 4.1-2.6 7.8-6 9.2-3.4-1.4-6-5.1-6-9.2V6.2L12 4zm-2 5h4v2h-4V9z'/>";

            string path = slot switch {
                "head" => head, "chest" => chest, "hands" => hands, "legs" => legs, "feet" => feet, "rightHand" => rightHand, "leftHand" => leftHand, _ => ""
            };
            return $"<svg viewBox='0 0 24 24' fill='{color}' width='100%' height='100%'>{path}</svg>";
        }
    }
}
