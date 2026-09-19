import towers from './towers.json';
import enemies from './enemies.json';
import green from './maps/green.json';
import snow from './maps/snow.json';
import desert from './maps/desert.json';
import water from './maps/water.json';
import vast from './maps/vast.json';
import dunes from './maps/dunes.json';

export const TOWER_DEFS = towers;
export const ENEMY_DEFS = enemies;
export const MAPS = { green, snow, desert, water, vast, dunes };
export const MAP_ORDER = ['green', 'snow', 'desert', 'water', 'vast', 'dunes'];
export const TOWER_ORDER = ['crossbow', 'spike', 'cannon', 'frozen'];
