# Brief: PropertyPro AI hero doodle

- **Kind**: a picture that draws itself (`houseDraw`, kind "drawing"), then a seamless idle loop (`houseIdle`, kind "loop").
  User: "some kind of doodle of house animation in the hero section"; chose "Replace the photo".
- **Style**: Ballpoint sketch (user chose, recommended): one blue biro, near-constant line, tone only from hatch placement,
  ink beads where a firm stroke stops. Ground: plain white (the hero's background), no paper grain, so the site can
  multiply the video over its own background.
- **Shape**: 1600x900 (16:9 web hero), shown object-fit: cover behind the hero copy and calculator.
- **Length**: draw-in 9 s (8 s drawing + 1 s hold); idle loop 6 s. *(mine)*
- **Sound**: silent (a hero). *(mine)*
- **Idea**: a Singapore neighbourhood sketched in biro: an HDB block with its void deck, corridor bands and bamboo
  laundry poles beside a rain tree, a low street running off to the right. *(mine)*
- **Focal subject**: the HDB block, lower-left (the stage freed under the headline). Light from the upper left: the
  block's right side face and the corridor recesses in shade.
- **Realism**: HDB slab block, corridor-access type: open void deck with pillars, a parapet band and shaded corridor per
  storey, lift motor room and water tank on the roof, bamboo laundry poles out of the side kitchen windows. Rain tree
  (Samanea saman): short trunk, wide umbrella crown. Two terrace houses with gable roofs. A condo tower edge far right.
- **Composition constraints** (hero layout, canvas coords at 1440x900): headline + copy occupy x 210-880, y 250-560;
  calculator x 920-1390, y 200-680; visible stage: lower-left x 210-900 y 570-820, the band y 690-820 across, the right
  margin x 1390-1520, sky y 80-190. Ground line y 820 (the hero's wave covers below ~830).
- **Idle**: laundry sways (integer cycles over the loop), three birds glide across the sky (off-frame at the seam), so
  frame 0 of the loop equals the finished drawing.
