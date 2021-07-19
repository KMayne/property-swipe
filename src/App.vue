<template>
  <div id="app">
    <md-toolbar><h1>Property Swiper</h1></md-toolbar>
    <section v-if="user !== undefined && onShortlistPage">
      <h2>Starred</h2>
      <ul class="shortlist">
        <li v-for="listingID in starredListingIds" :key="listingID">
          <a :href="`https://www.zoopla.co.uk/to-rent/details/${listingID}`">{{listingID}}</a>
          <button @click="markUnavailable(listingID)">Mark unavailable</button>
        </li>
      </ul>
      <h2>Accepted</h2>
      <ul class="shortlist">
        <li v-for="listingID in acceptedListingIds" :key="listingID">
          <a :href="`https://www.zoopla.co.uk/to-rent/details/${listingID}`">{{listingID}}</a>
          <button @click="markUnavailable(listingID)">Mark unavailable</button>
        </li>
      </ul>
    </section>
    <section v-if="!onShortlistPage && listing !== undefined">
      <ul>
        <li class="heading">
          £{{listing.price}} pcm - {{listing.summary}} - {{listing.locality}}
        </li>
        <li>
          <i class="material-icons"> directions_transit </i>
          {{listing.transitCommuteMins}} minutes to work via public transport
        </li>
        <li>
          <i class="material-icons"> directions_bike </i>
          {{listing.bikeCommuteMins}} minutes to work via bike
        </li>
        <li>
          <i class="material-icons"> link </i>
          <a :href="listing.link" rel="nofollow" target="_blank">{{listing.link}}</a>
        </li>
      </ul>
      <section class="photos">
        <img v-for="photoUrl in listing.photos" :key="photoUrl" class="photo" :src="photoUrl">
      </section>
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
      <p>{{listings.length}} properties remaining</p>
    </section>
    <h2 v-if="!onShortlistPage && listing === undefined">
      No listings
    </h2>
  </div>
</template>

<script lang="ts">
import Vue from 'vue';
import { Carousel, Slide } from 'vue-carousel';
import moment from 'moment';
moment.locale('en-gb');

interface Listing {
  listingID: string;
  price: number;
  summary: string;
  locality: string;
  transitCommuteMins: number;
  bikeCommuteMins: number;
  photoUrl: string;
  link: string;
  priceHistory: HistoricPrice[];
}

interface HistoricPrice {
  date: string;
  price: number;
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
  computed: {
    onShortlistPage(): boolean {
      return location.pathname === '/shortlist';
    },
    unavailableProperties(): Set<number> {
      return new Set(this.user.unavailable || []);
    },
    starredListingIds(): number[] {
      return this.user.starred.filter(id => !this.unavailableProperties.has(id));
    },
    acceptedListingIds(): number[] {
      return this.user.accepted.filter(id => !this.unavailableProperties.has(id));
    }
  },
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

    setKey(key: string) {
      localStorage.setItem('loginKey', key);
    },

    addURLKey(url: string) {
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
    
    markUnavailable(listingID) {
     if (this.user.unavailable === undefined) this.user.unavailable = [];
     this.user.unavailable.push(listingID);
     this.updateUser();
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

.photos {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-evenly;
}

img.photo {
  margin: auto;
  max-height: 60vh;
  max-width: 80vw;
  display: block;
  padding: 8px;
}

ul {
  list-style-type: none;
  padding: 8px;
  max-width: 800px;
  margin: auto;
}

ul.shortlist {
  margin: 1rem;
}

h2 {
  margin: 0.8rem;
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

p {
  text-align: center;
}
</style>
