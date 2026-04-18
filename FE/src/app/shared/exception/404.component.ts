import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'exception-404',
  templateUrl: './404.html',
})
export class Exception404Component {
  constructor(private route: Router) {}
  click() {
    this.route.navigate(['/login']);
  }
}
