import core from "./core";
import common from "./common";
import shell from "./shell";
import tonight from "./tonight";
import tasks from "./tasks";
import route from "./route";
import lines from "./lines";
import journey from "./journey";
import service from "./service";
import archive from "./archive";
import auth from "./auth";
import conflict from "./conflict";
import settings from "./settings";
import quickadd from "./quickadd";
import onboarding from "./onboarding";
import insights from "./insights";
import tasksPage from "./tasksPage";
import notify from "./notify";
import scene from "./scene";

const messages = {
  ...core,
  ...common,
  ...shell,
  ...tonight,
  ...tasks,
  ...route,
  ...lines,
  ...journey,
  ...service,
  ...archive,
  ...auth,
  ...conflict,
  ...settings,
  ...quickadd,
  ...onboarding,
  ...insights,
  ...tasksPage,
  ...notify,
  ...scene,
};

export default messages;
