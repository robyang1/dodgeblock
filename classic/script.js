/*
See readme for tips and info!
*/
function setup() {
  //16:10 = MASTERRACE
  //if the user's screen has more width for 16:10 than height, put bars on the side, otherwise put it at the top
  if(windowWidth*5/8 > windowHeight) {
  createCanvas(windowHeight*8/5, windowHeight);
  } else{
    createCanvas(windowWidth, windowWidth*5/8);
  }
  textAlign(CENTER, CENTER);
  frameRate(60);
}

//tweak for fun i guess
var gravity = 0.3;
//function reset() {
//will be put into use later (hopefully)
var scene = "MENU";

//the y value of the very upper side of the camera
var camY = 0;

var offGround = 10;
var timeSinceJump = 0;
var jumps = 0;
var framesPerBlock;
var score;
var scoreCoins = 0;
var frameDiff = 0;
//frames since the jump key was last let go
var jKeyLetGo = 455;

function rectrect(rect1, rect2) {
  return ( ((rect1.x <= rect2.x) && (rect2.x <= rect1.x + rect1.w)) ||
             ((rect2.x <= rect1.x) && (rect1.x <= rect2.x + rect2.w)) ) &&
           ( ((rect1.y <= rect2.y) && (rect2.y <= rect1.y + rect1.h)) ||
             ((rect2.y <= rect1.y) && (rect1.y <= rect2.y + rect2.h)) );
}

function windowResized() {
  //if(scene = "DEAD") {
    //return;
 // }
  //if the user's screen has more width for 16:10 than height, put bars on the side, otherwise put it at the top
  if(windowWidth*5/8 > windowHeight) {
    resizeCanvas(windowHeight*8/5, windowHeight);
  } else{
    resizeCanvas(windowWidth, windowWidth*5/8);
  }
}

function gameOver() {
  scene = "DEAD";
  pop();
  scale(width / 800, height / 500);
  noStroke();
  background(220);
  fill(0);
  textAlign(CENTER, CENTER);
  textSize(60);
  textStyle(BOLD);
  text("Game Statistics:", 400, 50);
  textAlign(LEFT, BOTTOM);
  textSize(40);
  text("Extras:", 600, 160);
  textStyle(NORMAL);
  text("FPB: " + framesPerBlock, 550, 210);
  text("Canvas Size:", 550, 300);
  text(round(width) + " x " + round(height), 550, 350);
  text("Height reached: " + round(camY) + " cm", 60, 160);
  text("Total blocks: " + blocks.length, 60, 210);
  text("+ Coins collected: " + scoreCoins / 200 + "  x200", 30, 260);
  text("_____________________", 20, 280);
  textSize(60);
  text("Total Score: " + score, 20, 360);
  textAlign(CENTER, CENTER);
  textSize(50);
  text("Click or press r to play again.", 400, 450);
  textStyle(NORMAL);
}

var keys = [];
function keyPressed() {
  keys[keyCode] = true;
}
function keyReleased() {
  keys[keyCode] = false;
}

var Player = {
  x: 385,
  y: 270,
  w: 30,
  h: 30,
  yVel: 0,
  xVel: 0,
  //horizontal movement speed from key presses
  hMov: 1.25,
  shieldTimer: 0,
  hTimer: -999990,
  vTimer: -99990,
  dTimer: -99990,
  powerups: []
}

//the jump
Player.jump = function() {
  //only execute if the player has been on the ground VERY recently
  if((offGround < 3 && timeSinceJump > 2) ||(this.dTimer > 0 && jumps < 2 && jKeyLetGo === 1)) {
    //fiddle with this to change the jump height
    if(this.vTimer > 0) {
      this.yVel = 9;
    } else {
      this.yVel = 8;
    }
    timeSinceJump = 0;
    jumps++;
  }
}
Player.walk = function(dir) {
  this.xVel += dir;
}

//checks platform collision in the x-direction
Player.walkedInPlatform = function() {
  
  for(var i = 0; i < platforms.length; i++) {
    //check if they are in a wall, if so, move the f**k out!
    slope = 0;
    while(slope < 20 && platforms[i].checkCollision()) {
      this.y-=0.2;
      slope++;
    }
    if(slope === 20) {
      
      this.x -= this.xVel;
      this.xVel = 0;
      this.y += slope*0.2;
    }
  }
}

//updates the position of the player based on current speeds
Player.updateX = function() {
  this.originalPos = this.x;
  //if(abs(this.xVel) > 7.5) {
    //this.xVel -= this.xVel/abs(this.xVel)*1.5;
  //} else {
    this.xVel *= 0.8;
  //}
  /*if(this.xVel > 1) {
    this.xVel -= 1;
  } else if (this.xVel < -1) {
    this.xVel += 1;
  } else {
    this.xVel = 0;
  }*/
  
  this.x += this.xVel;
  this.x = constrain(this.x, -100, 900-this.w)
}
Player.updateY = function() {
  this.originalPos = Player.y;
  //it's weird cuz positive y is downwards...
  if(this.yVel < 4 || keys[UP_ARROW] || keys[87]) {//to make higher jumps the longer the up arrow is pressed
    this.yVel -= gravity;
  } else {
    this.yVel -= gravity * 2;
  }
  //so I just flip the y! Smart right?
  this.y -= this.yVel;
}
Player.draw = function() {
  noStroke();
  fill(255, 0, 0);
  rect(this.x, this.y, this.w, this.h, this.w / 10);
  fill(0);
  
  //jump costumes
  if(this.yVel > 0.5) {
    //jump looking right
    if(this.xVel > 0.8) {
      
      //eyes
      rect(this.x + this.w * 0.3, this.y + this.h * 0.22, this.w * 0.15, this.h * 0.15);
      rect(this.x + this.w * 0.75, this.y + this.h * 0.22, this.w * 0.15, this.h * 0.15);
      
      //mouth
      rect(this.x + this.w * 0.40, this.y + this.h * 0.54, this.w * 0.4, this.h * 0.25);
    } else if(this.xVel < -0.8) {//jump looking left
      
      //eyes
      rect(this.x + this.w * 0.1, this.y + this.h * 0.22, this.w * 0.15, this.h * 0.15);
      rect(this.x + this.w * 0.55, this.y + this.h * 0.22, this.w * 0.15, this.h * 0.15);
      
      //mouth
      rect(this.x + this.w * 0.20, this.y + this.h * 0.54, this.w * 0.4, this.h * 0.25);
    } else {//jump regular
      
      //eyes
      rect(this.x + this.w * 0.2, this.y + this.h * 0.22, this.w * 0.15, this.h * 0.15);
      rect(this.x + this.w * 0.65, this.y + this.h * 0.22, this.w * 0.15, this.h * 0.15);
      
      //mouth
      rect(this.x + this.w * 0.30, this.y + this.h * 0.54, this.w * 0.4, this.h * 0.25);
    }
  } else if(this.yVel < -3.3) {//falling
    //falling looking right
    if(this.xVel > 0.8) {
      
      //eyes
      rect(this.x + this.w * 0.3, this.y + this.h * 0.43, this.w * 0.15, this.h * 0.15);
      rect(this.x + this.w * 0.75, this.y + this.h * 0.43, this.w * 0.15, this.h * 0.15);
      
      //mouth
      rect(this.x + this.w * 0.40, this.y + this.h * 0.73, this.w * 0.4, this.h * 0.25);
    } else if(this.xVel < -0.8) {//falling looking left
      
      //eyes
      rect(this.x + this.w * 0.1, this.y + this.h * 0.43, this.w * 0.15, this.h * 0.15);
      rect(this.x + this.w * 0.55, this.y + this.h * 0.43, this.w * 0.15, this.h * 0.15);
      
      //mouth
      rect(this.x + this.w * 0.20, this.y + this.h * 0.73, this.w * 0.4, this.h * 0.25);
    } else {//falling regular
      
      //eyes
      rect(this.x + this.w * 0.2, this.y + this.h * 0.43, this.w * 0.15, this.h * 0.15);
      rect(this.x + this.w * 0.65, this.y + this.h * 0.43, this.w * 0.15, this.h * 0.15);
      
      //mouth
      rect(this.x + this.w * 0.30, this.y + this.h * 0.73, this.w * 0.4, this.h * 0.25);
    }
  } else {
    //looking right
    if(this.xVel > 0.8) {
      
      //eyes
      rect(this.x + this.w * 0.3, this.y + this.h / 3, this.w * 0.15, this.h * 0.15);
      rect(this.x + this.w * 0.75, this.y + this.h / 3, this.w * 0.15, this.h * 0.15);
      
      //mouth
      rect(this.x + this.w * 0.40, this.y + this.h * 2 / 3, this.w * 0.4, this.h * 0.25);
    } else if(this.xVel < -0.8) {//looking left
      //eyes
      rect(this.x + this.w * 0.1, this.y + this.h / 3, this.w * 0.15, this.h * 0.15);
      rect(this.x + this.w * 0.55, this.y + this.h / 3, this.w * 0.15, this.h * 0.15);
      
      //mouth
      rect(this.x + this.w * 0.20, this.y + this.h * 2 / 3, this.w * 0.4, this.h * 0.25);
    } else {//regular
      //eyes
      rect(this.x + this.w * 0.2, this.y + this.h / 3, this.w * 0.15, this.h * 0.15);
      rect(this.x + this.w * 0.65, this.y + this.h / 3, this.w * 0.15, this.h * 0.15);
      
      //mouth
      rect(this.x + this.w * 0.30, this.y + this.h * 2 / 3, this.w * 0.4, this.h * 0.25);
    }
  }
  if(this.shieldTimer > 0) {
    //shield ellipse
    noFill();
    strokeWeight(this.w/15);
    stroke(27, 209, 130);
    ellipse(this.x + this.w / 2, this.y + this.h / 2, this.w*1.414, this.h*1.414);
  }
}

function shield(x, y, w, h) {
  this.type = "I";
  this.x = x;
  this.y = y;
  this.w = w;
  this.h = h;
  this.fixed = false;
  this.yVel = 0;
  this.timer = 0;
  this.draw = function() {
    stroke(27, 209, 130);
    noFill();
    ellipse(this.x+this.w/2, this.y+this.h/2, this.w, this.h);
  }
}
function hSpeed(x, y, w, h) {
  this.type = "H";
  this.x = x;
  this.y = y;
  this.w = w;
  this.h = h;
  this.fixed = false;
  this.yVel = 0;
  this.timer = 0;
  this.draw = function() {
    textSize(this.w/2);
    strokeWeight(this.w/10);
    stroke(0);
    fill(163, 209, 27);
    rect(this.x, this.y, this.w, this.h);
    fill(0);
    text("<->", this.x+this.w/2, this.y+this.h/2);
  }
}
function dJump(x, y, w, h) {
  this.type = "D";
  this.x = x;
  this.y = y;
  this.w = w;
  this.h = h;
  this.fixed = false;
  this.yVel = 0;
  this.timer = 0;
  this.draw = function() {
    textSize(this.w/2);
    strokeWeight(this.w/10);
    stroke(0);
    fill(163, 209, 27);
    rect(this.x, this.y, this.w, this.h);
    fill(0);
    text("↑↑", this.x+this.w/2, this.y+this.h/2);
  }
}
function vSpeed(x, y, w, h) {
  this.type = "V";
  this.x = x;
  this.y = y;
  this.w = w;
  this.h = h;
  this.fixed = false;
  this.yVel = 0;
  this.timer = 0;
  this.draw = function() {
    textSize(this.w);
    strokeWeight(this.w/10);
    stroke(0);
    fill(163, 209, 27);
    rect(this.x, this.y, this.w, this.h);
    fill(0);
    text("↕", this.x+this.w/2, this.y+this.h/2);
  }
}
function coin(x, y, w, h) {
  this.type = "S";
  this.x = x;
  this.y = y;
  this.w = w;
  this.h = h;
  this.fixed = false;
  this.yVel = 0;
  this.timer = 0;
  this.draw = function() {
    strokeWeight(this.w/10);
    stroke(186, 159, 0);
    fill(255, 215, 0);
    ellipse(this.x+this.w/2, this.y+this.h/2, this.w, this.h);
    textSize(this.w/3);
    fill(0);
    noStroke();
    text("+200", this.x + this.w/2, this.y + this.h / 2)
  }
}
var powerups = [];

function Block(x, y, w, h) {
  this.x = x;
  this.y = y;
  this.w = w;
  this.h = h;
  this.yVel = 0;
  this.originalPos;
  this.fixed = false; //3/5/19 update, this should help reduce lag
  this.draw = function() {
    if(this.y+camY < -this.h) {
      fill(255, 0, 0);
      noStroke();
      rect(round(this.x), -camY, this.w, 5);
    } else {
    strokeWeight(round(this.w/30));
    stroke(50);
    fill(222,184,135);
    rect(round(this.x), this.y, this.w, this.h, this.w/10);
    }
  }
  this.update = function() {
    this.originalPos = this.y;
    this.yVel += gravity;
    this.y += this.yVel;
  }
}
var blocks = [];
blocks.add = function(x, y, w, h) {blocks.push(new Block(x, y, w, h))};
var Ground = {
  x:-100, y:300, w:1000, h:900
}

var classes = [];
for(var i = 0; i < 600; i++) {
  classes.push([]);
  classes[0].push(-100 + i*20); //cleverly using the same loop
}

var pwrCounter = 0;

//}//the reset function closing brace
//reset();
function draw() {
  switch(scene) {
    case "MENU":
      scale(width/800, height/500);
      background(215, 236, 250);
      fill(222,184,135);
      stroke(50);
      strokeWeight(2);
      rect(30, 100, 60, 40, 3);
      rect(710, 100, 60, 40, 3);
      strokeWeight(3);
      line(40, 50, 40, 90);
      line(60, 40, 60, 90);
      line(80, 50, 80, 90);
      line(720, 50, 720, 90);
      line(740, 40, 740, 90);
      line(760, 50, 760, 90);
      noStroke();
      fill(0);
      textSize(80);
      text("Click to start", 400, 200);
      textSize(40);
      text("Arrow keys or WASD to move.\nAvoid falling blocks and don't get trapped.", 400, 400)
      if(mouseIsPressed) {
        frameDiff = frameCount;
        scene = "GAME";
      }
      break;
    case "GAME":
      displayShield = new shield(0.2*width/30, height/40, width/40, height/25);
      displayH = new hSpeed(1.2*width/30, height/40, width/40, height/25);
      displayD = new dJump(2.2*width/30, height/40, width/40, height/25);
      displayV = new vSpeed(3.2*width/30, height/40, width/40, height/25);
      framesPerBlock = round(12000000/((frameCount-frameDiff)*350+100000));
      
      //initially 2 and 1.25
      if(Player.hTimer > 0) {
        Player.hMov = 1.8;
      } else {
        Player.hMov = 1.15;
      }
      jKeyLetGo++;
      if(keys[UP_ARROW] || keys[87]) {
        Player.jump();
      } else {
        jKeyLetGo = 0;
      }
      if(keys[LEFT_ARROW] || keys[65]) {
        Player.walk(-Player.hMov);
      }
      if(keys[RIGHT_ARROW] || keys[68]) {
        Player.walk(Player.hMov);
      }
      if(keys[DOWN_ARROW] || keys[83]) {
        if(Player.vTimer > 0) {
          Player.yVel -= 0.6;
        }
      }
      background(176, 232, 255);
      //push();
      scale(width/800, height/500);
      var tX = -constrain(Player.x-400, -100, 100);
      var tY = camY;
      translate(tX, tY);
      noStroke();
      rect(Ground.x, Ground.y, Ground.w, Ground.h);
      if((frameCount-frameDiff) % framesPerBlock === 0) {
        blocks.add(Math.floor(random(-100, 840)), -camY-280+round(1000/framesPerBlock), 60, 40);
        switch(pwrCounter % 35) {
          case 6:
            powerups.push(new shield(Math.floor(random(-100, 840)), -camY-40, 20, 20));
            break;
          case 13:
            powerups.push(new hSpeed(Math.floor(random(-100, 840)), -camY-40, 20, 20));
            break;
          case 20:
            powerups.push(new dJump(Math.floor(random(-100, 840)), -camY-40, 20, 20));
            break;
          case 27:
            powerups.push(new vSpeed(Math.floor(random(-100, 840)), -camY-40, 20, 20));
            break;
          case 34:
            powerups.push(new coin(Math.floor(random(-100, 840)), -camY-40, 20, 20));
            break;
        }
        pwrCounter++;
      }
      for(var i = max(blocks.length-200, 0); i < blocks.length; i++) {
        if(!blocks[i].fixed) {
          //console.log(highest[blocks[i].x]);
          blocks[i].update();
          var c = ceil((300 - blocks[i].y)/blocks[i].h) - 1;
          if(c == 0) {
            blocks[i].y = 300 - blocks[i].h*(c+1);
            blocks[i].fixed = true;
            blocks[i].yVel = 0;
            classes[c+1].push(i);
            break;
          } else {
            for(var j = 0; j < classes[c].length; j++) {
              if(rectrect(blocks[i], blocks[classes[c][j]])) {
                blocks[i].y = 300 - blocks[i].h*(c+1);
                blocks[i].fixed = true;
                blocks[i].yVel = 0;
                classes[c+1].push(i);
                break;
              }
            }
          }
        }
        if(blocks[i].y < -camY+500 && 
           !( blocks[i].fixed && blocks[i].y < -camY - blocks[i].h)
          && abs(blocks[i].x + blocks[i].w/2 - Player.x - Player.w/2) < 800)
          blocks[i].draw();
      }
      //wait WHY IS THIS HERE TWICE
      for(i = max(0, blocks.length-300); i < blocks.length; i++) {
        if(rectrect(Player, blocks[i])) {
          
          if(Player.y<blocks[i].y) {
            Player.y = blocks[i].y - Player.h;
            
            Player.yVel = 0;
            offGround = 0;
            jumps = 0;
          } else if(blocks[i].yVel > 3) {//squished by a falling block
            if(Player.shieldTimer > 0) {
              blocks.splice(i, 1);
              i--;
              continue;
            }
            scene = "DEAD";
          } else {//probably ceiling
            Player.yVel = 0;
            while(rectrect(Player, blocks[i])) {//normal jump on top of a block
              Player.y += 0.2;
            }
          }
        }
      }

      Player.shieldTimer--;
      Player.hTimer--;
      Player.vTimer--;
      Player.dTimer--;

      Player.updateX();
      for(i = max(0, blocks.length-300); i < blocks.length; i++) {
        if(rectrect(Player, blocks[i])) {
          Player.xVel = 0;/* uncomment for wall jump version
          if(keys[UP_ARROW]) {
            if(Player.x < Player.originalPos) {
              Player.xVel = 11;
              Player.yVel = 8;
            } else {
              Player.xVel = -11;
              Player.yVel = 8;
            }
          }*/
          Player.x = Player.originalPos;
          
        }
      }
      Player.updateY();
      if(rectrect(Player, Ground)) {
        Player.y = Ground.y - Player.h;
        Player.yVel = 0;
        offGround = 0;
      }
      for(i = max(0, blocks.length-300); i < blocks.length; i++) {
        if(rectrect(Player, blocks[i])) {
          if(Player.y<blocks[i].y) {
            Player.y = blocks[i].y - Player.h-0.1;
            Player.yVel = 0;
            offGround = 0;
            jumps = 0;
          } else if(blocks[i].yVel > 3) {//squished by a falling block
            if(Player.shieldTimer > 0) {
              blocks.splice(i, 1);
              i--;
              continue;
            }
            scene = "DEAD";
          } else {//probably ceiling
            Player.yVel = 0;
            while(rectrect(Player, blocks[i])) {//normal jump on top of a block
              Player.y += 0.2;
            }
          }
        }
      }
      Player.draw();
      for(i = 0; i < powerups.length; i++) {
        powerups[i].yVel+=gravity;
        powerups[i].y += powerups[i].yVel;
        //checks collision with ground
        if(rectrect(powerups[i], Ground)) {
          powerups[i].yVel = 0;
          powerups[i].y = Ground.y - powerups[i].h;
        }
        for(j = 0; j < blocks.length; j++) {
          if(rectrect(powerups[i], blocks[j])) {
            powerups[i].yVel = 0;
            powerups[i].y = blocks[j].y - powerups[i].h;
          }
        }
        //makes the flashy effect when the powerup is about to disappear
        if(powerups[i].timer < 240 || frameCount % 16 < 8) {
          powerups[i].draw();
        }
        //when the powerup is collected by the player
        if(rectrect(powerups[i], Player)) {
          switch(powerups[i].type) {
            case "I":
              Player.shieldTimer = constrain(Player.shieldTimer, 0, 99999);
              Player.shieldTimer += 600;
              break;
            case "H":
              Player.hTimer = constrain(Player.hTimer, 0, 99999);
              Player.hTimer += 600;
              break;
            case "D":
              Player.dTimer = constrain(Player.dTimer, 0, 99999);
              Player.dTimer += 600;
              break; //LMAO ON 3/5/19 I JUST REALIZED I WAS MISSING THIS SO EVERY DOUBLE JUMP POWERUP ALSO GAVE A VERTICAL... LMAO I ONLY REALIZED WHEN I IMPLEMENTED POWERUP INDICATORS
            case "V":
              Player.vTimer = constrain(Player.vTimer, 0, 99999);
              Player.vTimer += 1000;
              break;
            case "S":
              scoreCoins += 200;
              break;
          }
          Player.powerups.push(powerups[i].type);
          powerups.splice(i, 1);
          //since splicing moves back the index of all the next elements in the array
          i--;
          continue;
        }
        powerups[i].timer++;
        //5 second lifetime
        if(powerups[i].timer > 
           300) {
          powerups.splice(i, 1);
          //since splicing moves back the index of all the next elements in the array
          i--;
        }
      }
      offGround++;
      timeSinceJump++;
      //pop();
      //camY+=Math.sqrt(1.15*Math.sqrt(frameCount/10000+1))-1;
      camY += 2/framesPerBlock;
      //checks if the player is really high in the frame
      if(Player.y+camY < 150) {
        //makes it so that the camY can never go down
        if(-Player.y + 150 > camY) {
          //bases the camera off the player position when it gains a new high jump
          camY = -Player.y + 150;
        }

      }
      score = round(camY) + blocks.length + scoreCoins;
      if(Player.y> -camY + 500) {
        scene = "DEAD";
      }
      translate(-tX, -tY);
      //powerup indicators (at top left)
      if(Player.shieldTimer > 120 || Player.shieldTimer > 0 && Player.shieldTimer < 120 && frameCount % 16 < 8) {
        displayShield.draw();
      }
      if(Player.hTimer > 120 || Player.hTimer > 0 && Player.hTimer < 120 && frameCount % 16 < 8) {
        displayH.draw();
      }
      if(Player.dTimer > 120 || Player.dTimer > 0 && Player.dTimer < 120 && frameCount % 16 < 8) {
        displayD.draw();
      }
      if(Player.vTimer > 120 || Player.vTimer > 0 && Player.vTimer < 120 && frameCount % 16 < 8) {
        displayV.draw();
      }
      noStroke();
      fill(0);
      textAlign(RIGHT, CENTER);
      // textSize(25) on a "normal" sized canvas
      textSize(25);
      text("Score: " + score, 790, 13);
      text("Frames Per Block: " + framesPerBlock, 790, 40);
      text("FPS: "+ round(frameRate()), 790, 67);
      textAlign(CENTER, CENTER);
      break;
    case "DEAD":
      gameOver();
      if(mouseIsPressed || keys[82]) {
        textAlign(CENTER, CENTER);
        rectMode(CORNER);
        blocks = [];
        blocks.add = function(x, y, w, h) {blocks.push(new Block(x, y, w, h))};
        powerups = [];
        
        score = 0;
        
        Player.x = 385;
        Player.y = 270;
        Player.yVel = 0;
        Player.xVel = 0;
        Player.hMov = 0;
        Player.shieldTimer = 0;
        Player.vTimer = 0;
        Player.hTimer = 0;
        Player.dTimer = 0;
        pwrCounter = 0;
        
        camY = 0;
        scoreCoins = 0;
        offGround = 10;
        timeSinceJump = 0;
        jumps = 0;
        classes = [];
        for(var i = 0; i < 600; i++) {
          classes.push([]);
          classes[0].push(-100 + i*20); //cleverly using the same loop
        }
        
        frameDiff = frameCount;
        scene = "GAME";
      }
  }
}
