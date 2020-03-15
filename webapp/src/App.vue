<template>
  <div id="app">
    <md-toolbar><h1>Property Swiper</h1></md-toolbar>
    <carousel :perPage="1">
      <slide v-for="photoUrl in listing.photos" class="photo-slide">
        <img class="photo" :src="photoUrl">
      </slide>
    </carousel>
    <ul>
      <li class="heading">
        £{{listing.price}} pcm - {{listing.summary}} - {{listing.locality}}
      </li>
      <li>
        <i class="material-icons"> work </i>
        {{listing.workCommuteMins}} minutes to work
      </li>
      <li>
        <i class="material-icons"> favorite </i>
        {{listing.gfCommuteMins}} minutes to girlfriend
      </li>
      <li>
        <i class="material-icons"> link </i>
        <a :href="listing.link" rel="nofollow" target="_blank">{{listing.link}}</a>
      </li>
    </ul>
    <div class="actions">
      <md-button class="md-icon-button md-raised undo">
        <md-icon>undo</md-icon>
      </md-button>
      <md-button class="md-icon-button md-raised no big">
        <md-icon>close</md-icon>
      </md-button>
      <md-button class="md-icon-button md-raised yes big">
        <md-icon>check</md-icon>
      </md-button>
      <md-button class="md-icon-button md-raised star">
        <md-icon>star</md-icon>
      </md-button>
    </div>
  </div>
</template>

<script lang="ts">
import Vue from 'vue';
import { Carousel, Slide } from 'vue-carousel';

const listing = {
  price: 1250,
  summary: '1 bed flat',
  locality: 'Harrow',
  workCommuteMins: 38,
  gfCommuteMins: 53,
  link: 'https://www.zoopla.co.uk/to-rent/details/28710078',
  listingID: '28710078',
  photos: [
    'https://lid.zoocdn.com/645/430/1e908a9a9686b21bbc1aca9f7d1bc94a58a6626a.jpg',
    'https://lid.zoocdn.com/645/430/afbb0c1ab60fa6e85df715fd10bad65fe1667d63.jpg',
    'https://lid.zoocdn.com/645/430/17c6004e05b874a6a799f6181d9a8a9bd01ac07f.jpg',
    'https://lid.zoocdn.com/645/430/3d393866d37067471b3db2033717a6008cb7ea98.jpg',
    'https://lid.zoocdn.com/645/430/98d3042a1f81aa22935a120996eb009b9d9a46c9.jpg'
  ]
};

export default Vue.extend({
  components: {
    Carousel,
    Slide
  },
  data: () => ({
    listing
  })
});
</script>

<style>
html {
  font-family: 'Lucida Grande';
}

.md-toolbar {
  margin-bottom: 16px;
}

.photo-slide {
  text-align: center;
}

img.photo {
  max-width: 100%;
}

.VueCarousel-pagination {
  position: relative;
  top: -90px;
  height: 0;
}

ul {
  list-style-type: none;
  padding: 8px;
  max-width: 800px;
  margin: auto;
}

li.heading {
  font-size: 1.4em;
  font-weight: bold;
  margin-bottom: 8px;
}

li {
  margin: 16px 0;
}

li > a {
  margin-left: 3px;
}

.material-icons {
  vertical-align: bottom;
}

.actions {
  margin-top: 36px;
  text-align: center;
}

.md-button.undo {
  background-color: rgb(255, 193, 7) !important;
}

.md-button.no {
  background-color: rgb(244, 67, 54) !important;
}

.md-button.yes {
  background-color: rgb(76, 175, 80) !important;
}

.md-button.star {
  background-color: rgb(0, 188, 212) !important;
}

.md-icon-button.big {
  width: 64px;
  height: 64px;
}
</style>
