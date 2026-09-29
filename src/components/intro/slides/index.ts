import type { ComponentType } from "react";
import type { SlideProps } from "../kit";
import PlansBreak from "./02-PlansBreak";
import AutoRoute from "./06-AutoRoute";
import LiveReroute from "./07-LiveReroute";
import FocusCheck from "./08-FocusCheck";
import Ride from "./10-Ride";

/**
 * The deck, in order: the trouble first, then what Nocturne does about it,
 * the live re-routing at its centre. The last slide (the way in) is the deck's own.
 */
export const SLIDES: ComponentType<SlideProps>[] = [PlansBreak, AutoRoute, LiveReroute, FocusCheck, Ride];
