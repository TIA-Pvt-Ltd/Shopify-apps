function stack(area, count, line = 40, offset = 0) {
  const total = count * line;
  const start = area.y + Math.max(12, (area.height - total) / 2) + offset;
  return (index) => start + index * line;
}

const text = (options) => ({ kind: "text", strokeWidth: 0, textAlign: "center", ...options });

export const DESIGN_IDEAS = [
  {
    id: "heritage",
    name: "Heritage mark",
    category: "Brand",
    preview: ["EST. 2024", "ATELIER"],
    previewClass: "idea-heritage",
    layers(area) {
      const y = stack(area, 2, 44, -8);
      return [
        text({
          text: "EST. 2024",
          fontFamily: "Montserrat",
          fontSize: 13,
          fontWeight: "600",
          charSpacing: 10,
          fill: "#111111",
          y: y(0),
        }),
        text({
          text: "ATELIER",
          fontFamily: "Playfair Display",
          fontSize: 46,
          fontWeight: "700",
          fill: "#111111",
          y: y(1) - 6,
        }),
      ];
    },
  },
  {
    id: "studio",
    name: "Studio lockup",
    category: "Brand",
    preview: ["THE", "STUDIO"],
    previewClass: "idea-studio",
    layers(area) {
      const y = stack(area, 2, 42);
      return [
        text({
          text: "THE",
          fontFamily: "Montserrat",
          fontSize: 14,
          fontWeight: "600",
          charSpacing: 14,
          fill: "#111111",
          y: y(0),
        }),
        text({
          text: "STUDIO",
          fontFamily: "Oswald",
          fontSize: 48,
          fontWeight: "bold",
          textTransform: "uppercase",
          charSpacing: 4,
          fill: "#111111",
          y: y(1) - 8,
        }),
      ];
    },
  },
  {
    id: "varsity",
    name: "Varsity chest",
    category: "Athletic",
    preview: ["CITY", "TIGERS"],
    previewClass: "idea-varsity",
    layers(area) {
      const y = stack(area, 2, 50, -12);
      return [
        text({
          text: "CITY",
          fontFamily: "Anton",
          fontSize: 28,
          fill: "#111111",
          curve: 28,
          charSpacing: 8,
          y: y(0),
        }),
        text({
          text: "TIGERS",
          fontFamily: "Anton",
          fontSize: 52,
          fill: "#c81e1e",
          stroke: "#ffffff",
          strokeWidth: 4,
          textTransform: "uppercase",
          y: y(1),
        }),
      ];
    },
  },
  {
    id: "player",
    name: "Name and number",
    category: "Athletic",
    preview: ["PLAYER", "10"],
    previewClass: "idea-player",
    layers() {
      return [{ kind: "names", name: "PLAYER", number: "10", fontFamily: "Anton", fontSize: 28, fill: "#111111" }];
    },
  },
  {
    id: "script",
    name: "Script signature",
    category: "Script",
    preview: ["Beloved"],
    previewClass: "idea-script",
    layers(area) {
      const y = stack(area, 1, 48);
      return [
        text({
          text: "Beloved",
          fontFamily: "Pacifico",
          fontSize: 44,
          fill: "#111111",
          curve: 12,
          y: y(0),
        }),
      ];
    },
  },
  {
    id: "monogram",
    name: "Monogram",
    category: "Brand",
    preview: ["AE"],
    previewClass: "idea-mono",
    layers(area) {
      const y = stack(area, 1, 80);
      return [
        text({
          text: "AE",
          fontFamily: "Playfair Display",
          fontSize: 72,
          fontWeight: "700",
          fill: "#111111",
          charSpacing: 2,
          y: y(0),
        }),
      ];
    },
  },
  {
    id: "slogan",
    name: "Work / Humble",
    category: "Type",
    preview: ["WORK HARD", "STAY HUMBLE"],
    previewClass: "idea-slogan",
    layers(area) {
      const y = stack(area, 2, 36);
      return [
        text({
          text: "WORK HARD",
          fontFamily: "Oswald",
          fontSize: 28,
          fontWeight: "bold",
          textTransform: "uppercase",
          charSpacing: 3,
          fill: "#111111",
          y: y(0),
        }),
        text({
          text: "STAY HUMBLE",
          fontFamily: "Montserrat",
          fontSize: 14,
          fontWeight: "600",
          charSpacing: 6,
          fill: "#111111",
          y: y(1),
        }),
      ];
    },
  },
  {
    id: "coast",
    name: "Coast line",
    category: "Type",
    preview: ["PACIFIC", "COAST"],
    previewClass: "idea-coast",
    layers(area) {
      const y = stack(area, 2, 44);
      return [
        text({
          text: "PACIFIC",
          fontFamily: "Bebas Neue",
          fontSize: 48,
          textTransform: "uppercase",
          charSpacing: 6,
          fill: "#111111",
          y: y(0),
        }),
        text({
          text: "COAST",
          fontFamily: "Montserrat",
          fontSize: 16,
          fontWeight: "600",
          charSpacing: 12,
          fill: "#111111",
          y: y(1) + 4,
        }),
      ];
    },
  },
  {
    id: "collegiate",
    name: "Collegiate",
    category: "Athletic",
    preview: ["STATE"],
    previewClass: "idea-college",
    layers(area) {
      const y = stack(area, 1, 56);
      return [
        text({
          text: "STATE",
          fontFamily: "Anton",
          fontSize: 56,
          fill: "#1d4ed8",
          stroke: "#ffffff",
          strokeWidth: 5,
          textTransform: "uppercase",
          y: y(0),
        }),
      ];
    },
  },
  {
    id: "stamp",
    name: "Goods stamp",
    category: "Brand",
    preview: ["GENUINE", "GOODS"],
    previewClass: "idea-stamp",
    layers(area) {
      const y = stack(area, 2, 34);
      return [
        text({
          text: "GENUINE",
          fontFamily: "Bebas Neue",
          fontSize: 36,
          charSpacing: 8,
          fill: "#111111",
          shadowEnabled: true,
          shadowBlur: 4,
          shadowOffsetX: 1,
          shadowOffsetY: 1,
          y: y(0),
        }),
        text({
          text: "GOODS",
          fontFamily: "Bebas Neue",
          fontSize: 36,
          charSpacing: 10,
          fill: "#111111",
          y: y(1),
        }),
      ];
    },
  },
  {
    id: "minimal",
    name: "Less but better",
    category: "Type",
    preview: ["LESS", "BUT BETTER"],
    previewClass: "idea-minimal",
    layers(area) {
      const y = stack(area, 2, 32);
      return [
        text({
          text: "LESS",
          fontFamily: "Oswald",
          fontSize: 40,
          fontWeight: "bold",
          charSpacing: 10,
          fill: "#111111",
          y: y(0),
        }),
        text({
          text: "BUT BETTER",
          fontFamily: "Montserrat",
          fontSize: 12,
          fontWeight: "600",
          charSpacing: 8,
          fill: "#111111",
          y: y(1) + 6,
        }),
      ];
    },
  },
  {
    id: "year",
    name: "Established",
    category: "Brand",
    preview: ["EST", "88"],
    previewClass: "idea-year",
    layers(area) {
      const y = stack(area, 2, 48, -6);
      return [
        text({
          text: "EST",
          fontFamily: "Montserrat",
          fontSize: 14,
          fontWeight: "600",
          charSpacing: 12,
          fill: "#111111",
          y: y(0),
        }),
        text({
          text: "88",
          fontFamily: "Playfair Display",
          fontSize: 64,
          fontWeight: "700",
          fill: "#111111",
          y: y(1) - 10,
        }),
      ];
    },
  },
  {
    id: "crest",
    name: "City crest",
    category: "Brand",
    preview: ["LOS ANGELES", "ATLAS", "EST 1991"],
    previewClass: "idea-crest",
    layers(area) {
      const y = stack(area, 3, 38, -8);
      return [
        text({
          text: "LOS ANGELES",
          fontFamily: "Montserrat",
          fontSize: 11,
          fontWeight: "600",
          charSpacing: 10,
          fill: "#111111",
          y: y(0),
        }),
        text({
          text: "ATLAS",
          fontFamily: "Playfair Display",
          fontSize: 52,
          fontWeight: "700",
          fill: "#111111",
          y: y(1) - 10,
        }),
        text({
          text: "EST 1991",
          fontFamily: "Montserrat",
          fontSize: 11,
          fontWeight: "600",
          charSpacing: 10,
          fill: "#111111",
          y: y(2) + 6,
        }),
      ];
    },
  },
  {
    id: "outline",
    name: "Outline mark",
    category: "Type",
    preview: ["NOIR"],
    previewClass: "idea-outline",
    layers(area) {
      const y = stack(area, 1, 56);
      return [
        text({
          text: "NOIR",
          fontFamily: "Archivo Black",
          fontSize: 56,
          fill: "#ffffff",
          stroke: "#111111",
          strokeWidth: 3,
          textTransform: "uppercase",
          charSpacing: 4,
          y: y(0),
        }),
      ];
    },
  },
  {
    id: "editorial",
    name: "Sunday journal",
    category: "Script",
    preview: ["Sunday", "JOURNAL"],
    previewClass: "idea-editorial",
    layers(area) {
      const y = stack(area, 2, 40);
      return [
        text({
          text: "Sunday",
          fontFamily: "Playfair Display",
          fontSize: 48,
          fontWeight: "700",
          fontStyle: "italic",
          fill: "#111111",
          y: y(0),
        }),
        text({
          text: "JOURNAL",
          fontFamily: "Montserrat",
          fontSize: 12,
          fontWeight: "600",
          charSpacing: 12,
          fill: "#111111",
          y: y(1) + 8,
        }),
      ];
    },
  },
  {
    id: "condensed",
    name: "Worldwide",
    category: "Athletic",
    preview: ["WORLDWIDE"],
    previewClass: "idea-condensed",
    layers(area) {
      const y = stack(area, 1, 48);
      return [
        text({
          text: "WORLDWIDE",
          fontFamily: "Barlow Condensed",
          fontSize: 42,
          fontWeight: "700",
          textTransform: "uppercase",
          charSpacing: 6,
          fill: "#111111",
          y: y(0),
        }),
      ];
    },
  },
  {
    id: "house",
    name: "House of goods",
    category: "Type",
    preview: ["THE HOUSE", "OF GOODS"],
    previewClass: "idea-house",
    layers(area) {
      const y = stack(area, 2, 36);
      return [
        text({
          text: "THE HOUSE",
          fontFamily: "Oswald",
          fontSize: 32,
          fontWeight: "bold",
          textTransform: "uppercase",
          charSpacing: 4,
          fill: "#111111",
          y: y(0),
        }),
        text({
          text: "OF GOODS",
          fontFamily: "Oswald",
          fontSize: 32,
          fontWeight: "bold",
          textTransform: "uppercase",
          charSpacing: 6,
          fill: "#111111",
          y: y(1),
        }),
      ];
    },
  },
  {
    id: "modern",
    name: "Form and function",
    category: "Type",
    preview: ["FORM", "AND FUNCTION"],
    previewClass: "idea-modern",
    layers(area) {
      const y = stack(area, 2, 34);
      return [
        text({
          text: "FORM",
          fontFamily: "Poppins",
          fontSize: 44,
          fontWeight: "700",
          charSpacing: 8,
          fill: "#111111",
          y: y(0),
        }),
        text({
          text: "AND FUNCTION",
          fontFamily: "Poppins",
          fontSize: 12,
          fontWeight: "600",
          charSpacing: 8,
          fill: "#111111",
          y: y(1) + 8,
        }),
      ];
    },
  },
];

export const IDEA_CATEGORIES = ["Brand", "Athletic", "Script", "Type"];
