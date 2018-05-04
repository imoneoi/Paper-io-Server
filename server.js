/****** Server Configurations ********/
const SERVER_PORT = 8080;

const MAX_SPAWN_COUNT = 10; //Spawn count
const MIN_SPAWN_DIST = 8;

const MAX_PLAYER_COUNT = 8; //Player count

const TIME_LIMIT = 600; //Seconds

const dx = [1, 0, 0, -1];
const dy = [0, 1, -1, 0];
/***** Utils ******/
function rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
}
function new2DArray(x, y) {
    var ret = new Array(x);
    for(var i = 0; i < x; i++) ret[i] = new Array(y);
    return ret;
}

class CoordSet {
    constructor() {
        this.clear();
    }
    clear() {
        this.vector = [];
        this.set = {};
    }
    exist(x, y) {
        return this.set.hasOwnProperty(toString(x) + "," + toString(y));
    }
    insert(x, y) {
        if(!exist(x, y)) {
            this.vector.push({ x: x, y: y });
            this.set[toString(x) + "," + toString(y)] = true;
        }
    }
    erase(x, y) {
        if(exist(x, y)) {
            delete this.set[toString(x) + "," + toString(y)];
            this.vector.splice(this.vector.indexOf({ x: x, y: y }), 1);
        }
    }
    size() {
        return this.vector.length;
    }
}
/***** Player Utils ********/
class Player {
    constructor(id, conn, name, skin, x, y) {
        //alive
        this.alive = true;
        //Basics
        this.id = id;
        this.conn = conn;
        //Name & skin
        this.name = name;
        this.skin = skin;
        //Direction
        this.x = x;
        this.y = y;
        this.nextdir = this.dir = rand(0, 3);
        //Lands
        this.path = new CoordSet;
        this.land = new CoordSet;
        for(var tx = x - 1; tx <= x + 1; tx++) for(var ty = y - 1; ty <= y + 1; ty++)
            this.land.insert(tx, ty);
        //Kill count
        this.killcount = 0;
        //Message Queue
        this.msgqueue = [];
    }
    //Socket Interface
    sendMsg(str) {
        try {
            if(this.conn.readyState === WebSocket.OPEN)
                this.conn.send(str);
        } catch (error) {
            log("[ERROR] #" + this.id + " Send Error: " + error.toString());
        }
    }
    disconnect() {
        try {
            this.conn.terminate();
        } catch (error) {
            log("[ERROR] #" + this.id + " Disconnect Error: " + error.toString());
        }
    }
    //Messaging
    sendMsg(command, data) {
        sendMsg(command + " " + JSON.stringify(data));
    }
    queueMsg(command, data) {
        this.msgqueue.push([command, data]);
    }
    proceedQueue() {
        if(this.msgqueue.length) {
            sendMsg("MULTI", this.msgqueue);
            this.msgqueue = [];
        }
    }
}

class Map {
    constructor(width, height, maxplayer, maxspawncount) {
        this.W = width;
        this.H = height;

        this.maxplayer = maxplayer;
        this.maxspawncount = maxspawncount;

        this.spawncount = 0;

        this.players = {};

        reset();
    }

    reset() {
        this.started = false;
        this.waiting = false;
        this.starttime = false;

        this.spawncount = 0;
        for(var id in this.players)
            remove_player(id);

        //Init land
        this.land = {};
        for(var tx = 0; tx < this.W; tx++) for(var ty = 0; ty < this.H; ty++)
            this.land[toString(tx) + "," + toString(ty)] = null;
    }

    remove_player(id) {
        remove_player_land(id);

        this.players[id].proceedQueue();
        this.players[id].disconnect();

        delete this.players[id];
    }

    remove_player_land(id) {
        for(var index in this.players[id].land.vector) {
            var coord = this.players[id].land.vector[index];

            this.set_land(coord.x, coord.y, null);
        }
        this.players[id].land.clear();
        this.players[id].path.clear();
    }

    proceed_player_queue() {
        for(var id in this.players) {
            this.players[ id ].proceedQueue();
        }
    }
    broadcast_msg(command, data) {
        for(var id in this.players) {
            this.players[ id ].queueMsg(command, data);
        }
    }
    send_command(type, data) {
        switch(type) {
            case "MOVE":
                
            break;

            case "KILL":

            break;

            case "SCORE":

            break;

            case "GAMEOVER":

            break;

            case "SPAWN":
            break;

            case "INITPLAYER":
            break;
        }
    }

    set_land(x, y, player_id) {
        var coord_str = toString(x) + "," + toString(y),
            old_owner = this.land[coord_str];

        if(old_owner != null) this.players[old_owner].land.erase(x, y);
        if(player_id != null) this.players[player_id].land.insert(x, y);
        this.land[coord_str] = player_id;
    }
    find_newland(player_id, coord_set) {
        var occupied = new2DArray(this.W, this.H),
            vis = new2DArray(this.W, this.H);

        function dfs(x, y) {
            vis[x][y] = true;
            for(var i = 0; i < 4; i++) {
                var tx = x + dx[i],
                    ty = y + dy[i];
                if(tx >= 0 && tx < this.W && ty >= 0 && ty < this.H && !occupied[tx][ty] && !vis[tx][ty])
                    dfs(tx, ty);
            }
        }
        function dfs_start(x, y) {
            if(!occupied[x][y] && !vis[x][y]) dfs(x, y);
        }

        var player = this.players[player_id];
        for(var x = 0; x < this.W; x++) for(var y = 0; y < this.H; y++) {
            vis[x][y] = false;
            occupied[x][y] = player.land.exist(x, y);
        }

        //Floodfill Borders
        for(var x = 0; x < this.W; x++) { dfs_start(x, 0); dfs_start(x, this.H - 1); }
        for(var y = 0; y < this.H; y++) { dfs_start(0, y); dfs_start(this.W - 1, y); }

        for(var x = 0; x < this.W; x++) for(var y = 0; y < this.H; y++)
            if(!vis[x][y] && !occupied[x][y]) coord_set.insert(x, y);
    }
    update_player() {
        //Move sequence Land >> Path
        var move_seq = [];
        for(var id in this.players) {
            move_seq.push({
                id: id,
                landsize: this.players[id].land.size(),
                pathsize: this.players[id].path.size()
            });
        }
        move_seq.sort(function(a, b) {
            return (a.landsize == b.landsize) ? (a.pathsize > b.pathsize) : (a.landsize > b.landsize);
        });
        //Do moving
        for(var move_index in move_seq) {
            var player = this.players[ move_seq[move_index].id ];
            if(!player.alive) continue;

            player.dir = player.nextdir;
            player.x += dx[player.dir];
            player.y += dy[player.dir];

            //Kill self
            if((player.x < 0 || player.y < 0 || player.x >= this.W || player.y >= this.H) || player.path.exist(player.x, player.y)) {
                kill_player(player.id, null);
                continue;
            }
            
            //Move & Fill Path
            var corner = "";
            var newland = new CoordSet;
            var inpath = false;

            if(!player.land.exist(player.x, player.y)) {
                inpath = true;
                //Begin Path
                player.path.insert(player.x, player.y);
            }
            else {
                //Fill path
                for(var path_index in player.path.vector) {
                    var coord = player.path.vector[path_index];

                    set_land(coord.x, coord.y, player.id);
                    newland.insert(coord.x, coord.y);
                }
                //DFS Floodfill
                find_newland(player.id, newland);
                //Clear path
                player.path.clear();
            }

            //Kill others
            for(var other_id in this.players) if( other_id != player.id ) {
                var other = this.players[ other_id ];
                if(other.path.exist(player.x, player.y) || newland.exist(other.x, other.y)) {
                    kill_player(other.id, player.id);
                }
            }

            send_command("MOVE", {
                id: player.id,
                x: player.x,
                y: player.y,

                corner: corner,
                newland: newland,

                inpath: inpath
            });
        }
        //Remove not alive
        for(var player_id in this.players) {
            if(!this.players[player_id].alive)
                remove_player(player_id);
        }
        //Send Scores
        send_command("SCORE", {});
        //Proceed All Queues
        proceed_player_queue();
    }
    kill_player(id, killer, got100 = false) {
        if(killer != null) this.players[killer].killcount++;

        this.players[id].alive = false;

        send_command("KILL", { id: id });
        send_command("GAMEOVER", { id: id, kc: this.players[id].killcount, got100: got100 });
    }
    join_player(conn, name, skin) {
        if(this.spawncount >= MAX_SPAWN_COUNT || this.players.length >= MAX_PLAYER_COUNT) return false;

        var occupied = new2DArray(this.W, this.H);
        for(var id in this.players) {
            var player = this.players[id];
            for(var index in player.land.vector) {
                var coord = player.land.vector[index];
                occupied[coord.x][coord.y] = 1;
            }
            for(var index in player.path.vector) {
                var coord = player.path.vector[index];
                occupied[coord.x][coord.y] = 1;
            }
        }

        var availablePos = new CoordSet;
        for(var x = MIN_SPAWN_DIST; x < this.W - MIN_SPAWN_DIST; x++) for(var y = MIN_SPAWN_DIST; y < this.H - MIN_SPAWN_DIST; y++) {
            var Ok = true;
            for(var tx = x - MIN_SPAWN_DIST; tx <= x + MIN_SPAWN_DIST; tx++) {
                for(var ty = y - MIN_SPAWN_DIST; ty <= y + MIN_SPAWN_DIST; ty++) if(occupied[tx][ty]) {
                    Ok = false;
                    break;
                }

                if(!Ok) break;
            }

            if(Ok) availablePos.insert(x, y);
        }

        if(!availablePos.size()) return false;

        //Allocate ID
        var id;
        do { id = randID(); }
        while(typeof(this.players[id]) != "undefined");

        var coord = availablePos.vector[ rand(0, availablePos.size() - 1) ];
        var player = new Player(id, conn, name, skin, coord.x, coord.y);
        //Allocate Land
        for(var tx = x - 1; tx <= x + 1; tx++) for(var ty = y - 1; ty <= y + 1; )

        this.spawncount++;
        this.players[id] = player;

        return player;
    }
}

const WebSocket = require("ws");

const Server = new WebSocket.Server({
    port: SERVER_PORT
});