/* Custom Home Assistant icon set derived from the supplied Akuvox SVG mark. */
const akuvoxIcons = {
  smartplus: {
    path: "M8.1 17.9C4.1 17.9 1 15.5 1 12.5C1 9.8 3.5 7.6 6.9 7.2C8.4 4.8 11.5 3.4 15 3.4C19.6 3.4 23.3 6.2 23.3 9.7C23.3 9.9 23.3 10.1 23.2 10.4L20.6 10.4C20.7 10.1 20.7 9.9 20.7 9.7C20.7 7.3 18.2 5.4 15 5.4C12.3 5.4 10 6.8 9.3 8.8L9 9.6L7.9 9.7C5.5 9.8 3.7 11 3.7 12.5C3.7 14.3 5.6 15.8 8.1 15.8H12.7V17.9H8.1ZM17.2 11.9C18.3 11.9 19.2 12.6 19.2 13.4V15.7C20.2 16.3 20.8 17.2 20.8 18.2H13.5C13.5 17.2 14.1 16.3 15.1 15.7V13.4C15.1 12.6 16 11.9 17.2 11.9ZM16 19C16.2 19.7 16.9 20.2 18 20.2C19 20.2 19.8 19.7 20 19H16ZM20.5 11.2V12.5H19.2V13.8H20.5V15.1H21.8V13.8H23.1V12.5H21.8V11.2H20.5Z",
    keywords: ["akuvox", "smartplus", "doorbell", "intercom"],
  },
};

window.customIconsets = window.customIconsets || {};
window.customIconsets.akuvox = async (iconName) => ({
  path: akuvoxIcons[iconName]?.path,
  viewBox: "0 0 24 24",
});
window.customIconsets.akuvox.getIconList = async () => Object.entries(akuvoxIcons).map(([name, icon]) => ({
    name,
    keywords: icon.keywords,
  }));
