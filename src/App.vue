<template>
  <div id="app">
    <md-toolbar><h1>Property Swiper</h1></md-toolbar>
    <section v-if="listing !== undefined">
      <carousel :perPage="1" :navigateTo="slideNum" @page-change="page => slideNum = page">
        <slide v-for="photoUrl in listing.photos" class="photo-slide" :key="photoUrl">
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
          <i class="material-icons"> link </i>
          <a :href="listing.link" rel="nofollow" target="_blank">{{listing.link}}</a>
        </li>
      </ul>
      <div class="actions">
        <md-button
          @click="undoClicked"
          class="md-icon-button md-raised undo"
          :disabled="prevStates.length === 0">
          <md-icon>undo</md-icon>
        </md-button>
        <md-button @click="rejectClicked" class="md-icon-button md-raised no big">
          <md-icon>close</md-icon>
        </md-button>
        <md-button @click="acceptClicked" class="md-icon-button md-raised yes big">
          <md-icon>check</md-icon>
        </md-button>
        <md-button @click="starClicked" class="md-icon-button md-raised star">
          <md-icon>star</md-icon>
        </md-button>
      </div>
    </section>
    <h2 v-else>
      No listing
    </h2>
  </div>
</template>

<script lang="ts">
import Vue from 'vue';
import { Carousel, Slide } from 'vue-carousel';

interface Listing {
  listingID: string;
  price: number;
  summary: string;
  locality: string;
  workCommuteMins: number;
  photoUrl: string;
  link: string;
}

interface User {
  _id: string;
  accepted: string[];
  rejected: string[];
  starred: string[];
  username: string;
}

interface AppState {
  listing: Listing | undefined;
  listings: Listing[];
  prevStates: Array<User | undefined>;
  prevListings: Array<Listing | undefined>;
  user: User | undefined;
  slideNum: [number, boolean];
}

export default Vue.extend({
  components: {
    Carousel,
    Slide
  },
  data: () => ({
    listing: undefined,
    listings: [],
    prevStates: [],
    prevListings: [],
    user: undefined,
    slideNum: [0, false]
  } as AppState),
  mounted() {
    const query = location.search.substring(1);
    if (query.substr(0, 4) === 'key=') {
      this.setKey(query.substring(4));
    }

    fetch(this.addURLKey('/api/user'))
      .then(res => res.json())
      .then(user => this.user = user)
      .catch(err => console.error('Failed to load user', err));

    fetch(this.addURLKey('/api/listings'))
      .then(res => res.json())
      .then(listings => {
        this.listings = listings.reverse();
        this.listing = this.listings.pop();
      })
      .catch(err => console.error('Failed to load listings', err));
  },
  methods: {
    getKey() {
      return localStorage.getItem('loginKey');
    },

    setKey(key) {
      localStorage.setItem('loginKey', key);
    },

    addURLKey(url) {
      return url + '?key=' + this.getKey();
    },

    undoClicked() {
      if (this.prevStates.length <= 0 || this.prevListings.length <= 0) {
        return console.error('Cannot undo - no history');
      }
      this.user = this.prevStates.pop();
      this.updateUser();
      if (this.listing !== undefined) { this.listings.push(this.listing); }
      this.listing = this.prevListings.pop();
    },

    rejectClicked() {
      if (!this.user || !this.listing) { return; }
      this.saveState();
      // Add this item to list of rejected
      this.user.rejected.push(this.listing.listingID);
      this.updateUser();
      this.listing = this.listings.pop();
      this.slideNum = [0, false];
    },

    acceptClicked() {
      if (!this.user || !this.listing) { return; }
      this.saveState();
      // Add this item to list of rejected
      this.user.accepted.push(this.listing.listingID);
      this.updateUser();
      this.listing = this.listings.pop();
      this.slideNum = [0, false];
    },

    starClicked() {
      if (!this.user || !this.listing) { return; }
      this.saveState();
      // Add this item to list of rejected
      this.user.starred.push(this.listing.listingID);
      this.updateUser();
      this.listing = this.listings.pop();
      this.slideNum = [0, false];
    },

    saveState() {
      this.prevStates.push(JSON.parse(JSON.stringify(this.user)));
      this.prevListings.push(this.listing);
    },

    updateUser() {
      fetch(this.addURLKey('/api/user'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.user)
      }).then(async res => {
        if (!res.ok) { console.error('Error updating user', await res.text()); }
      });
    }
  }
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

.md-button.undo:enabled {
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
